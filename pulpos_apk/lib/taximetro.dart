import 'dart:math';

import 'api_sync.dart';
import 'calculadora.dart';

// ─── Taxímetro v5 ─────────────────────────────────────────────────────────────
//
// Modo S de la Directiva 2014/32/UE (Anexo IX, MI-007) con la superficie por tramos.
// Mismo algoritmo que verificacion.js del servidor. Por cada tramo de la ruta
// (d km y t s hasta el punto siguiente, F de la superficie marcada al llegar):
//
//   modo S: max(d × F × Tkm, t × Th)        modo D: d × F × Tkm + t × Th
//   Tkm = Cb + Cl × Pc                       Th = 60 × Ct
//   Importe = B + S × saltos completos
//
// Bajo la velocidad de cruce Th / (Tkm × F) gana el tiempo; encima, la distancia.
// Estar detenido no depende de la superficie: F solo multiplica la distancia. La altitud
// no es un factor aparte: queda dentro de los costos medidos en la ciudad.
//
// Enteros exactos: tarifas en milicentavos, distancia en mm y tiempo en s; un
// milicentavo son 9e6 unidades (mm × mc/km × 9 = s × mc/h × 2500), así los dos
// componentes se comparan y acumulan sin redondeos durante todo el viaje.

class TarifaTaximetro {
  const TarifaTaximetro({
    required this.modo,
    required this.bajada,
    required this.salto,
    required this.porKm,
    required this.porHora,
  });

  final ModoTarifa modo;
  final int bajada; // centavos
  final int salto; // centavos
  final Map<Superficie, int> porKm; // milicentavos por km
  final int porHora; // milicentavos por hora

  // Mismas operaciones que tarifasEnteras de verificacion.js
  factory TarifaTaximetro.desde(ParametrosTopograficos p) {
    final km = p.costoBaseKm + p.consumoLitrosKm * p.precioCombustibleBs;
    return TarifaTaximetro(
      modo: p.modoTarifa,
      bajada: (p.bajadaBandera * 100).round(),
      salto: (p.valorSalto * 100).round(),
      porKm: {
        Superficie.asfalto: (km * 1e5).round(),
        Superficie.tierra: (km * p.factorSuperficie * 1e5).round(),
        Superficie.empedrado: (km * p.factorEmpedrado * 1e5).round(),
      },
      porHora: (p.costoMinutoDetencion * 6e6).round(),
    );
  }

  // Directiva 2014/32/UE, Anexo IX: velocidad de cruce = tarifa por tiempo / tarifa por distancia
  double velocidadCruceKmh([Superficie s = Superficie.asfalto]) => porHora / porKm[s]!;
}

// Mismas operaciones y en el mismo orden que distanciaKm de validacion.js
double distanciaKm(double lat1, double lng1, double lat2, double lng2) {
  double rad(double x) => x * pi / 180;
  final s1 = sin(rad(lat2 - lat1) / 2);
  final s2 = sin(rad(lng2 - lng1) / 2);
  final a = s1 * s1 + cos(rad(lat1)) * cos(rad(lat2)) * (s2 * s2);
  return 2 * 6371 * asin(sqrt(a));
}

// La ruta viaja con 6 decimales: el cálculo usa las mismas coordenadas que verá el servidor
double coordenada(double x) => (x * 1e6).round() / 1e6;

enum EstadoTaximetro { libre, ocupado, aPagar }

class TransicionInvalida extends StateError {
  TransicionInvalida(EstadoTaximetro desde, String accion)
    : super('No se puede $accion en estado ${desde.name}');
}

class Taximetro {
  Taximetro(this.tarifa) : _saltoU = tarifa.salto * _uPorCentavo;

  // Recalcula un viaje desde su ruta guardada (al recuperar la app tras un cierre)
  factory Taximetro.desdeRuta(TarifaTaximetro tarifa, List<PuntoRuta> ruta) {
    final t = Taximetro(tarifa)..ocupar(ruta.first);
    for (final p in ruta.skip(1)) {
      t.registrar(p);
    }
    return t;
  }

  static const _uPorCentavo = 9000000000;

  final TarifaTaximetro tarifa;
  final int _saltoU;

  EstadoTaximetro _estado = EstadoTaximetro.libre;
  var _recorrido = RecorridoPorSuperficie();
  final List<PuntoRuta> _ruta = [];
  int _acumulado = 0;
  int _saltos = 0;
  int _segundosPorTiempo = 0;
  bool _ultimoPorTiempo = true;

  EstadoTaximetro get estado => _estado;
  RecorridoPorSuperficie get recorrido => _recorrido;
  List<PuntoRuta> get ruta => List.unmodifiable(_ruta);
  PuntoRuta? get ultimoPunto => _ruta.isEmpty ? null : _ruta.last;
  int get centavos => tarifa.bajada + _saltos * tarifa.salto;
  double get importe => centavos / 100;
  double get minutosPorTiempo => _segundosPorTiempo / 60;
  bool get ultimoTramoPorTiempo => _ultimoPorTiempo;

  void _exigir(EstadoTaximetro estado, String accion) {
    if (_estado != estado) throw TransicionInvalida(_estado, accion);
  }

  // LIBRE → OCUPADO: empieza en la bajada de bandera
  void ocupar(PuntoRuta inicio) {
    _exigir(EstadoTaximetro.libre, 'ocupar');
    _recorrido = RecorridoPorSuperficie();
    _ruta
      ..clear()
      ..add(inicio);
    _acumulado = 0;
    _saltos = 0;
    _segundosPorTiempo = 0;
    _ultimoPorTiempo = true;
    _estado = EstadoTaximetro.ocupado;
  }

  void registrar(PuntoRuta p) {
    _exigir(EstadoTaximetro.ocupado, 'registrar un punto');
    final a = _ruta.last;
    if (p.segundos < a.segundos) throw ArgumentError('El punto es anterior al último');
    final km = distanciaKm(
      coordenada(a.lat),
      coordenada(a.lng),
      coordenada(p.lat),
      coordenada(p.lng),
    );
    _recorrido.sumar(km, p.superficie);
    tramo((km * 1e6).round(), p.segundos - a.segundos, p.superficie);
    _ruta.add(p);
  }

  void tramo(int mm, int segundos, Superficie superficie) {
    final porDistancia = mm * tarifa.porKm[superficie]! * 9;
    final porTiempo = segundos * tarifa.porHora * 2500;
    _ultimoPorTiempo = porTiempo >= porDistancia;
    if (_ultimoPorTiempo) _segundosPorTiempo += segundos;
    _acumulado += tarifa.modo == ModoTarifa.d
        ? porDistancia + porTiempo
        : max(porDistancia, porTiempo);
    _saltos += _acumulado ~/ _saltoU;
    _acumulado %= _saltoU;
  }

  // Lo que marca mientras no llega otro punto: el tramo abierto ya debe al menos su tiempo
  int centavosEn(int segundosAhora) {
    if (_estado != EstadoTaximetro.ocupado) return centavos;
    final abierto = max(0, segundosAhora - _ruta.last.segundos);
    final u = _acumulado + abierto * tarifa.porHora * 2500;
    return tarifa.bajada + (_saltos + u ~/ _saltoU) * tarifa.salto;
  }

  // OCUPADO → A_PAGAR: cierra el último tramo en el lugar del último punto y congela el importe
  void cobrar(int segundosFinal, Superficie superficie) {
    _exigir(EstadoTaximetro.ocupado, 'cobrar');
    final u = _ruta.last;
    if (segundosFinal > u.segundos) {
      registrar(PuntoRuta(u.lat, u.lng, segundosFinal, superficie));
    }
    _estado = EstadoTaximetro.aPagar;
  }

  // A_PAGAR → LIBRE; de A_PAGAR no se vuelve a OCUPADO sin pasar por aquí
  void liberar() {
    _exigir(EstadoTaximetro.aPagar, 'liberar');
    _estado = EstadoTaximetro.libre;
  }
}
