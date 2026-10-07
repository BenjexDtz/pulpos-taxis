import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/detector_detencion.dart';

void main() {
  final t0 = DateTime(2026, 10, 7, 10, 0, 0);
  DateTime seg(int s) => t0.add(Duration(seconds: s));

  /// Simula la app segundo a segundo, en orden cronológico: en cada segundo
  /// primero llega la posición GPS (si hay) y luego el Timer hace tick.
  /// [posiciones]: segundo → (velocidad reportada m/s, metros recorridos).
  void simular(
    DetectorDetencion d,
    int desde,
    int hasta, {
    Map<int, (double, double)> posiciones = const {},
    int tickCada = 1,
  }) {
    for (var s = desde; s <= hasta; s++) {
      final p = posiciones[s];
      if (p != null) {
        d.registrarPosicion(seg(s), velocidadReportada: p.$1, metros: p.$2);
      }
      if (s % tickCada == 0) d.tick(seg(s));
    }
  }

  Map<int, (double, double)> cada(
    int n,
    int desde,
    int hasta,
    double velocidad,
    double metros,
  ) => {
    for (var s = desde; s <= hasta; s += n) s: (velocidad, metros),
  };

  test('BUG original: se mueve y luego se detiene sin recibir posiciones '
      '(distanceFilter 10 m) → la espera SÍ se cuenta', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 8);
    // 0–20 s en movimiento: una posición cada 2 s a 8 m/s (16 m)
    simular(d, 1, 20, posiciones: cada(2, 2, 20, 8, 16));
    expect(d.segundosDetenido, 0);

    // 20–80 s: semáforo / trancadera. El GPS no emite nada nuevo y la última
    // velocidad conocida sigue siendo 8 m/s (la lógica anterior contaba 0 s).
    simular(d, 21, 80);
    // Los primeros 10 s sin posiciones aún se consideran movimiento
    expect(d.segundosDetenido, 50);
    expect(d.detenido, isTrue);
  });

  test('velocidad reportada < 0.5 m/s cuenta desde ese momento', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 8);
    simular(d, 1, 12, posiciones: {2: (0.2, 0)});
    expect(d.segundosDetenido, 10); // del segundo 2 al 12
  });

  test('en movimiento constante no cuenta espera', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 10);
    simular(d, 1, 120, posiciones: cada(3, 3, 120, 10, 30));
    expect(d.segundosDetenido, 0);
    expect(d.detenido, isFalse);
  });

  test('GPS que reporta speed = 0 en movimiento: usa la velocidad calculada', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    // 20 m en 2 s = 10 m/s aunque el equipo diga 0
    simular(d, 1, 30, posiciones: cada(2, 2, 30, 0, 20));
    // Solo los 2 s antes de la primera posición (aún no se sabía que arrancó)
    expect(d.segundosDetenido, 2);
    expect(d.detenido, isFalse);
  });

  test('esperando al pasajero desde el inicio del viaje', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    simular(d, 1, 90);
    expect(d.minutosDetenido, 1.5);
  });

  test('si el timer se retrasa (ticks cada 5 s) igual cuenta el tiempo real', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    simular(d, 1, 60, tickCada: 5);
    expect(d.segundosDetenido, 60);
  });

  test('al retomar la marcha deja de contar', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    // 30 s parado; arranca y la primera posición llega en el segundo 32
    simular(d, 1, 60, posiciones: cada(2, 32, 60, 9, 18));
    // Cuenta hasta que llega esa posición: margen de 2 s propio del GPS
    expect(d.segundosDetenido, 32);
    expect(d.detenido, isFalse);
  });

  test('deriva del GPS estando quieto (10 m en 60 s) no cuenta como movimiento', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    simular(d, 1, 90, posiciones: {60: (0, 10)});
    expect(d.segundosDetenido, 90);
  });

  test('tarifa: 60 s de semáforo ahora suman Ct × Td', () {
    // Mismo escenario del bug: 50 s cobrables × Bs 0.50/min = Bs 0.4167
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 8);
    simular(d, 1, 80, posiciones: cada(2, 2, 20, 8, 16));
    expect(d.minutosDetenido * 0.50, closeTo(0.4167, 1e-4));
  });
}
