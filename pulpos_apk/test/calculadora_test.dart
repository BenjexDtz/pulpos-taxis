import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';

// Fórmula v3: T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
// Parámetros de El Alto: Cb=2.00, Cl=0.100, Pc=6.96, FH=1.40, FR tierra=2.50, Ct=0.50
void main() {
  group('calcularTarifa', () {
    double tarifaElAlto({
      required double distanciaKm,
      required double factorSuperficie,
      required double tiempoDetencionMin,
      double consumoLitrosKm = 0.100,
    }) => calcularTarifa(
      distanciaKm: distanciaKm,
      costoBaseKm: 2.00,
      consumoLitrosKm: consumoLitrosKm,
      precioCombustibleBs: 6.96,
      factorAltitud: 1.40,
      factorSuperficie: factorSuperficie,
      tiempoDetencionMin: tiempoDetencionMin,
      costoMinutoDetencion: 0.50,
    );

    test('escenario crítico: 5 km en tierra con 10 min de espera', () {
      // 5 × (2 + 0.1×6.96) × 1.4 × 2.5 + 10 × 0.5 = 47.18 + 5 = 52.18
      final t = tarifaElAlto(
        distanciaKm: 5,
        factorSuperficie: 2.5,
        tiempoDetencionMin: 10,
      );
      expect(t, closeTo(52.18, 1e-9));
    });

    test('escenario ideal: 5 km en asfalto sin espera', () {
      // 5 × 2.696 × 1.4 × 1.0 = 18.872
      final t = tarifaElAlto(
        distanciaKm: 5,
        factorSuperficie: 1.0,
        tiempoDetencionMin: 0,
      );
      expect(t, closeTo(18.872, 1e-9));
    });

    test('sin combustible (Cl=0) reproduce la fórmula anterior', () {
      expect(
        tarifaElAlto(
          distanciaKm: 5,
          factorSuperficie: 2.5,
          tiempoDetencionMin: 10,
          consumoLitrosKm: 0,
        ),
        closeTo(40.0, 1e-9),
      );
      expect(
        tarifaElAlto(
          distanciaKm: 5,
          factorSuperficie: 1.0,
          tiempoDetencionMin: 0,
          consumoLitrosKm: 0,
        ),
        closeTo(14.0, 1e-9),
      );
    });

    test('viaje de 0 km sin espera cuesta 0', () {
      expect(
        tarifaElAlto(distanciaKm: 0, factorSuperficie: 1, tiempoDetencionMin: 0),
        0,
      );
    });

    test('solo espera: 3 min detenido cobra Ct × Td', () {
      expect(
        tarifaElAlto(distanciaKm: 0, factorSuperficie: 1, tiempoDetencionMin: 3),
        closeTo(1.5, 1e-9),
      );
    });
  });

  group('DesgloseTarifa', () {
    test('el total coincide con calcularTarifa', () {
      const p = ParametrosTopograficos.porDefecto;
      final d = DesgloseTarifa.calcular(
        params: p,
        distanciaKm: 3.5,
        tiempoDetencionMin: 8.5,
        factorSuperficie: p.factorSuperficie,
        tipoSuperficie: 'tierra',
      );
      final t = calcularTarifa(
        distanciaKm: 3.5,
        costoBaseKm: p.costoBaseKm,
        consumoLitrosKm: p.consumoLitrosKm,
        precioCombustibleBs: p.precioCombustibleBs,
        factorAltitud: p.factorAltitud,
        factorSuperficie: p.factorSuperficie,
        tiempoDetencionMin: 8.5,
        costoMinutoDetencion: p.costoMinutoDetencion,
      );
      expect(d.tarifaTotal, closeTo(t, 1e-9));
      expect(d.costoCombustibleKm, closeTo(0.696, 1e-9));
      expect(d.costoVariableKm, closeTo(2.696, 1e-9));
    });
  });

  group('ParametrosTopograficos.fromJson', () {
    test('lee la respuesta real del servidor (NUMERIC llega como texto)', () {
      final p = ParametrosTopograficos.fromJson({
        'id': 1,
        'zona_ciudad': 'El Alto - Topografía Compleja',
        'costo_base_km': '2.00',
        'factor_altitud': '1.40',
        'factor_superficie': '2.50',
        'costo_minuto_detencion': '0.50',
        'consumo_litros_km': '0.100',
        'precio_combustible_bs': '6.96',
        'costo_combustible_km': 0.696,
      });
      expect(p.costoBaseKm, 2.0);
      expect(p.factorAltitud, 1.4);
      expect(p.factorSuperficie, 2.5);
      expect(p.costoMinutoDetencion, 0.5);
      expect(p.consumoLitrosKm, 0.1);
      expect(p.precioCombustibleBs, 6.96);
    });

    test('sin campos de combustible usa los valores por defecto', () {
      final p = ParametrosTopograficos.fromJson({
        'id': 1,
        'zona_ciudad': 'x',
        'costo_base_km': '2.00',
        'factor_altitud': '1.40',
        'factor_superficie': '2.50',
        'costo_minuto_detencion': '0.50',
      });
      expect(p.consumoLitrosKm, 0.1);
      expect(p.precioCombustibleBs, 6.96);
    });
  });

  group('viajeParaServidor', () {
    test('viaje v3 en tierra envía todos los parámetros aplicados', () {
      final body = viajeParaServidor({
        'id': 7,
        'chofer_id': 2,
        'distancia_km': 3.5,
        'tiempo_detencion_min': 8.5,
        'factor_altitud': 1.4,
        'factor_superficie': 2.5,
        'tarifa_total': 37.27,
        'estado_sincronizacion': 0,
        'fecha_hora': '2026-10-07T10:00:00.000',
        'tipo_superficie': 'tierra',
        'costo_base_km': 2.0,
        'costo_minuto_detencion': 0.5,
        'consumo_litros_km': 0.1,
        'precio_combustible_bs': 6.96,
      });
      expect(body, {
        'distancia_km': 3.5,
        'tiempo_detencion_min': 8.5,
        'tarifa_cobrada': 37.27,
        'fecha_hora_viaje': '2026-10-07T10:00:00.000',
        'tipo_superficie': 'tierra',
        'factor_altitud_aplicado': 1.4,
        'factor_superficie_aplicado': 2.5,
        'costo_base_aplicado': 2.0,
        'costo_minuto_aplicado': 0.5,
        'consumo_litros_aplicado': 0.1,
        'precio_combustible_aplicado': 6.96,
      });
    });

    test('no envía chofer_id ni campos internos de SQLite', () {
      final body = viajeParaServidor({
        'id': 1,
        'chofer_id': 2,
        'estado_sincronizacion': 0,
        'distancia_km': 1.0,
        'tiempo_detencion_min': 0.0,
        'tarifa_total': 2.0,
        'fecha_hora': '2026-10-07T10:00:00.000',
        'factor_altitud': 1.4,
        'factor_superficie': 1.0,
      });
      expect(body.containsKey('chofer_id'), isFalse);
      expect(body.containsKey('id'), isFalse);
      expect(body.containsKey('estado_sincronizacion'), isFalse);
    });

    test('viaje viejo (v2, columnas nuevas en NULL) deduce la superficie '
        'y omite los nulos', () {
      final body = viajeParaServidor({
        'distancia_km': 2.0,
        'tiempo_detencion_min': 0.0,
        'tarifa_total': 10.0,
        'fecha_hora': '2026-05-01T08:00:00.000',
        'factor_altitud': 1.4,
        'factor_superficie': 2.5,
        'tipo_superficie': null,
        'costo_base_km': null,
        'costo_minuto_detencion': null,
        'consumo_litros_km': null,
        'precio_combustible_bs': null,
      });
      expect(body['tipo_superficie'], 'tierra');
      expect(body['factor_superficie_aplicado'], 2.5);
      expect(body.values, isNot(contains(null)));
      expect(body.containsKey('costo_base_aplicado'), isFalse);
    });

    test('factor 1.0 se marca como asfalto', () {
      final body = viajeParaServidor({'factor_superficie': 1.0});
      expect(body['tipo_superficie'], 'asfalto');
    });
  });
}
