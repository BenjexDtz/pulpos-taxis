import 'dart:math';

class DetectorDetencion {
  DetectorDetencion({
    required DateTime inicio,
    double velocidadInicial = 0,
    this.velocidadMinima = 0.5,
    this.tiempoSinPosicion = const Duration(seconds: 10),
  }) : _ultimaPosicion = inicio,
       _ultimoTick = inicio,
       _ultimaVelocidad = velocidadInicial,
       _detenido = velocidadInicial < velocidadMinima;

  final double velocidadMinima;
  final Duration tiempoSinPosicion;

  DateTime _ultimaPosicion;
  DateTime _ultimoTick;
  double _ultimaVelocidad;
  double _segundosDetenido = 0;
  bool _detenido;

  double get segundosDetenido => _segundosDetenido;
  double get minutosDetenido => _segundosDetenido / 60;
  bool get detenido => _detenido;

  void registrarPosicion(
    DateTime t, {
    required double velocidadReportada,
    required double metros,
  }) {
    final segundos = t.difference(_ultimaPosicion).inMilliseconds / 1000;
    final velocidadCalculada = segundos > 0 ? metros / segundos : 0.0;
    _ultimaVelocidad = max(velocidadReportada, velocidadCalculada);
    _ultimaPosicion = t;
  }

  bool tick(DateTime ahora) {
    final segundos = ahora.difference(_ultimoTick).inMilliseconds / 1000;
    _ultimoTick = ahora;
    if (_detenido && segundos > 0) _segundosDetenido += segundos;

    final sinPosicion =
        ahora.difference(_ultimaPosicion) >= tiempoSinPosicion;
    _detenido = sinPosicion || _ultimaVelocidad < velocidadMinima;
    return _detenido;
  }
}
