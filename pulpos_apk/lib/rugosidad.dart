import 'dart:math';

import 'calculadora.dart';

// Rugosidad del camino con el acelerómetro (lecturas con gravedad, m/s²).
// Se usa la magnitud |a|, que no depende de cómo esté montado el teléfono;
// una media lenta estima la gravedad y las frenadas, y lo que queda es la
// vibración. Cada punto GPS recibe el RMS de la vibración desde el anterior.
class MedidorVibracion {
  MedidorVibracion({this.alfa = 0.02, this.muestrasMinimas = 20});

  final double alfa;
  final int muestrasMinimas;

  double? _base;
  double _sumaCuadrados = 0;
  int _muestras = 0;

  void registrar(double x, double y, double z) {
    final magnitud = sqrt(x * x + y * y + z * z);
    final base = _base ?? magnitud;
    _base = base + alfa * (magnitud - base);
    final vibracion = magnitud - _base!;
    _sumaCuadrados += vibracion * vibracion;
    _muestras++;
  }

  // null si hubo pocas lecturas (sensor ausente o tramo muy corto)
  double? tomar() {
    final rms = _muestras >= muestrasMinimas ? sqrt(_sumaCuadrados / _muestras) : null;
    _sumaCuadrados = 0;
    _muestras = 0;
    return rms;
  }
}

enum Sugerencia { ninguna, caminoIrregular, caminoLiso }

// Compara la vibración reciente con la del asfalto de este mismo teléfono y
// vehículo (referencia que se aprende viaje a viaje). Solo sugiere: el chofer
// decide la superficie y la tarifa no cambia sola.
class SugerenciaSuperficie {
  SugerenciaSuperficie({
    double? referencia,
    this.puntosVentana = 8,
    this.umbralIrregular = 2.0,
    this.umbralLiso = 1.3,
    this.puntosEspera = 30,
  }) : referencia = (referencia ?? referenciaInicial).clamp(referenciaMinima, referenciaMaxima);

  static const referenciaInicial = 0.6;
  static const referenciaMinima = 0.2;
  static const referenciaMaxima = 2.0;
  static const _aprendizaje = 0.05;

  double referencia;
  final int puntosVentana;
  final double umbralIrregular;
  final double umbralLiso;
  final int puntosEspera;

  final List<double> _recientes = [];
  Superficie? _superficieAnterior;
  int _espera = 0;

  // Media de la vibración de los últimos puntos con lectura
  double? get vibracionReciente =>
      _recientes.length < puntosVentana ? null : _recientes.reduce((a, b) => a + b) / _recientes.length;

  Sugerencia registrar(double? vibracion, Superficie marcada) {
    if (marcada != _superficieAnterior) {
      _superficieAnterior = marcada;
      _recientes.clear();
      _espera = 0;
    }
    if (vibracion == null) return Sugerencia.ninguna;
    _recientes.add(vibracion);
    if (_recientes.length > puntosVentana) _recientes.removeAt(0);

    final media = vibracionReciente;
    if (media == null) return Sugerencia.ninguna;
    final razon = media / referencia;

    // La ventana puede mezclar tramos: se aprende solo si el punto también parece asfalto
    if (marcada == Superficie.asfalto && razon < 1.5 && vibracion / referencia < 1.5) {
      referencia = (referencia + _aprendizaje * (vibracion - referencia)).clamp(referenciaMinima, referenciaMaxima);
    }
    if (_espera > 0) {
      _espera--;
      return Sugerencia.ninguna;
    }
    if (marcada == Superficie.asfalto && razon >= umbralIrregular) return Sugerencia.caminoIrregular;
    if (marcada != Superficie.asfalto && razon <= umbralLiso) return Sugerencia.caminoLiso;
    return Sugerencia.ninguna;
  }

  // El chofer descartó el aviso: no repetirlo en un buen tramo
  void descartar() => _espera = puntosEspera;
}
