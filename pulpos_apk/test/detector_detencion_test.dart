import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/detector_detencion.dart';

void main() {
  final t0 = DateTime(2026, 10, 7, 10, 0, 0);
  DateTime seg(int s) => t0.add(Duration(seconds: s));

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
    simular(d, 1, 20, posiciones: cada(2, 2, 20, 8, 16));
    expect(d.segundosDetenido, 0);

    simular(d, 21, 80);
    expect(d.segundosDetenido, 50);
    expect(d.detenido, isTrue);
  });

  test('velocidad reportada < 0.5 m/s cuenta desde ese momento', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 8);
    simular(d, 1, 12, posiciones: {2: (0.2, 0)});
    expect(d.segundosDetenido, 10);
  });

  test('en movimiento constante no cuenta espera', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 10);
    simular(d, 1, 120, posiciones: cada(3, 3, 120, 10, 30));
    expect(d.segundosDetenido, 0);
    expect(d.detenido, isFalse);
  });

  test('GPS que reporta speed = 0 en movimiento: usa la velocidad calculada', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    simular(d, 1, 30, posiciones: cada(2, 2, 30, 0, 20));
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
    simular(d, 1, 60, posiciones: cada(2, 32, 60, 9, 18));
    expect(d.segundosDetenido, 32);
    expect(d.detenido, isFalse);
  });

  test('deriva del GPS estando quieto (10 m en 60 s) no cuenta como movimiento', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 0);
    simular(d, 1, 90, posiciones: {60: (0, 10)});
    expect(d.segundosDetenido, 90);
  });

  test('tarifa: 60 s de semáforo ahora suman Ct × Td', () {
    final d = DetectorDetencion(inicio: t0, velocidadInicial: 8);
    simular(d, 1, 80, posiciones: cada(2, 2, 20, 8, 16));
    expect(d.minutosDetenido * 0.50, closeTo(0.4167, 1e-4));
  });
}
