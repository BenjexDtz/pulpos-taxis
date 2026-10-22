import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:pulpos_tarifa_core/demostracion.dart';
import 'package:pulpos_tarifa_core/rugosidad.dart';
import 'package:pulpos_tarifa_core/taximetro.dart';

void main() {
  final demo = RecorridoDemostracion();
  final p = demo.puntos;

  group('RecorridoDemostracion', () {
    test('empieza en El Alto en el segundo 0 y avanza de 5 en 5 segundos', () {
      expect([p.first.lat, p.first.lng, p.first.segundos], [-16.5, -68.19, 0]);
      for (var i = 1; i < p.length; i++) {
        expect(p[i].segundos - p[i - 1].segundos, RecorridoDemostracion.intervalo);
      }
      expect(demo.duracion, demo.tramos.fold<int>(0, (s, t) => s + t.segundos));
    });

    test('cada tramo va a su velocidad y ninguno supera el filtro de 120 km/h', () {
      for (var i = 1; i < p.length; i++) {
        final kmh = distanciaKm(p[i - 1].lat, p[i - 1].lng, p[i].lat, p[i].lng) / (5 / 3600);
        expect(kmh, closeTo(demo.tramos[p[i].tramo].kmh, 0.1), reason: 'punto $i');
        expect(kmh, lessThan(120));
      }
    });

    test('detenido no hay vibración; en marcha sí', () {
      for (final punto in p.skip(1)) {
        final detenido = demo.tramos[punto.tramo].kmh == 0;
        expect(punto.vibracion == null, detenido);
      }
    });

    test('tramoEn indica qué superficie marcar en cada momento', () {
      expect(demo.tramoEn(0).descripcion, 'Avenida asfaltada');
      expect(demo.tramoEn(300).superficie, Superficie.tierra);
      expect(demo.tramoEn(demo.duracion + 30).descripcion, 'Vuelta a la avenida asfaltada');
    });
  });

  group('Sugerencias durante la demostración', () {
    Map<int, Sugerencia> primeraSugerencia(Superficie Function(TramoDemostracion) marcada) {
      final s = SugerenciaSuperficie(referencia: RecorridoDemostracion.referencia);
      final primera = <int, Sugerencia>{};
      for (final punto in p.skip(1)) {
        final r = s.registrar(punto.vibracion, marcada(demo.tramos[punto.tramo]));
        if (r != Sugerencia.ninguna) primera.putIfAbsent(punto.tramo, () => r);
      }
      return primera;
    }

    test('si el chofer no cambia la superficie, la tierra y el empedrado piden cambiarla', () {
      final r = primeraSugerencia((_) => Superficie.asfalto);
      expect([r[3], r[4]], [Sugerencia.caminoIrregular, Sugerencia.caminoIrregular]);
      expect(r.containsKey(0), isFalse);
    });

    test('si marca bien cada tramo, ningún aviso sobra', () {
      expect(primeraSugerencia((t) => t.superficie), isEmpty);
    });

    test('si se queda en empedrado al volver al asfalto, sugiere volver', () {
      final r = primeraSugerencia((t) => t.superficie == Superficie.asfalto && demo.tramos.indexOf(t) < 3
          ? Superficie.asfalto
          : Superficie.empedrado);
      expect(r[5], Sugerencia.caminoLiso);
    });
  });

  test('marcando cada superficie, el taxímetro cobra el tiempo del semáforo y los tres tipos de calle', () {
    final ruta = [
      for (final punto in p)
        PuntoRuta(coordenada(punto.lat), coordenada(punto.lng), punto.segundos, demo.tramos[punto.tramo].superficie,
            punto.vibracion),
    ];
    final t = Taximetro.desdeRuta(TarifaTaximetro.desde(ParametrosTopograficos.porDefecto), ruta);
    expect(t.recorrido.tipo, 'mixto');
    expect(t.recorrido.kmTierra, closeTo(0.625, 0.005));
    expect(t.recorrido.kmEmpedrado, closeTo(0.6, 0.005));
    expect(t.minutosPorTiempo, greaterThanOrEqualTo(0.75));
    expect(t.importe, greaterThan(ParametrosTopograficos.porDefecto.bajadaBandera));
  });
}
