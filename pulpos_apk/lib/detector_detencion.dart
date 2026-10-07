import 'dart:math';

/// Mide el tiempo que el taxi pasa detenido (Td en la fórmula: Ct × Td).
///
/// El stream GPS usa distanceFilter de 10 m: con el taxi quieto NO llegan
/// posiciones nuevas, así que la última velocidad recibida queda "congelada"
/// en el valor que tenía en movimiento. Por eso el taxi se considera detenido si:
///   - la última posición indica velocidad < [velocidadMinima], o
///   - no llega ninguna posición nueva en [tiempoSinPosicion]
///     (10 m en 10 s = menos de 3.6 km/h, prácticamente parado).
///
/// El tiempo se acumula con el reloj real entre ticks, no sumando 1 por tick,
/// para que no se pierdan segundos si el sistema retrasa el timer.
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

  /// En m/s. Por debajo de esto el taxi se considera detenido.
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

  /// Registrar cada posición GPS válida.
  ///
  /// Se usa la mayor entre la velocidad del GPS y la calculada con
  /// [metros] recorridos, porque algunos equipos reportan speed = 0
  /// aunque el vehículo se mueva.
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

  /// Llamar periódicamente (p. ej. cada segundo). Devuelve si está detenido.
  bool tick(DateTime ahora) {
    // El tramo desde el tick anterior se cobra según el estado que tenía
    // durante ese tramo, y recién después se evalúa el estado nuevo.
    final segundos = ahora.difference(_ultimoTick).inMilliseconds / 1000;
    _ultimoTick = ahora;
    if (_detenido && segundos > 0) _segundosDetenido += segundos;

    final sinPosicion =
        ahora.difference(_ultimaPosicion) >= tiempoSinPosicion;
    _detenido = sinPosicion || _ultimaVelocidad < velocidadMinima;
    return _detenido;
  }
}
