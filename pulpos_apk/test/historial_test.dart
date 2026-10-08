import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/pantalla_historial.dart';

void main() {
  final hoy = DateTime(2026, 10, 7, 15, 30);

  Map<String, dynamic> viaje(DateTime fecha, double tarifa) => {
    'fecha_hora': fecha.toIso8601String(),
    'tarifa_total': tarifa,
  };

  group('totalDelDia', () {
    test('suma solo los viajes de hoy', () {
      final viajes = [
        viaje(DateTime(2026, 10, 7, 8, 0), 10.0),
        viaje(DateTime(2026, 10, 7, 14, 45), 5.5),
        viaje(DateTime(2026, 10, 6, 22, 0), 100.0),
        viaje(DateTime(2025, 10, 7, 9, 0), 50.0),
      ];
      expect(totalDelDia(viajes, hoy), closeTo(15.5, 1e-9));
    });

    test('incluye los bordes del día (00:00 y 23:59:59)', () {
      final viajes = [
        viaje(DateTime(2026, 10, 7, 0, 0, 0), 1.0),
        viaje(DateTime(2026, 10, 7, 23, 59, 59), 2.0),
        viaje(DateTime(2026, 10, 8, 0, 0, 0), 4.0),
      ];
      expect(totalDelDia(viajes, hoy), closeTo(3.0, 1e-9));
    });

    test('sin viajes hoy devuelve 0', () {
      expect(totalDelDia([viaje(DateTime(2026, 1, 1), 9.0)], hoy), 0);
      expect(totalDelDia([], hoy), 0);
    });

    test('ignora fechas vacías o inválidas sin romperse', () {
      final viajes = [
        {'fecha_hora': null, 'tarifa_total': 9.0},
        {'fecha_hora': 'no-es-fecha', 'tarifa_total': 9.0},
        viaje(DateTime(2026, 10, 7, 9), 3.0),
      ];
      expect(totalDelDia(viajes, hoy), closeTo(3.0, 1e-9));
    });

    test('tarifa guardada como entero en SQLite', () {
      final viajes = [
        {'fecha_hora': '2026-10-07T10:00:00.000', 'tarifa_total': 7},
      ];
      expect(totalDelDia(viajes, hoy), 7.0);
    });
  });
}
