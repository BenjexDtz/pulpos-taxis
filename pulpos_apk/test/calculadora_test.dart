import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';

void main() {
  group('calcularTarifa', () {
    double tarifaElAlto({
      double kmAsfalto = 0,
      double kmTierra = 0,
      required double tiempoDetencionMin,
      double consumoLitrosKm = 0.100,
    }) => calcularTarifa(
      kmAsfalto: kmAsfalto,
      kmTierra: kmTierra,
      costoBaseKm: 2.00,
      consumoLitrosKm: consumoLitrosKm,
      precioCombustibleBs: 6.96,
      factorAltitud: 1.40,
      factorSuperficie: 2.5,
      tiempoDetencionMin: tiempoDetencionMin,
      costoMinutoDetencion: 0.50,
    );

    test('escenario crítico: 5 km en tierra con 10 min de espera', () {
      expect(
        tarifaElAlto(kmTierra: 5, tiempoDetencionMin: 10),
        closeTo(52.18, 1e-9),
      );
    });

    test('escenario ideal: 5 km en asfalto sin espera', () {
      expect(
        tarifaElAlto(kmAsfalto: 5, tiempoDetencionMin: 0),
        closeTo(18.872, 1e-9),
      );
    });

    test('viaje mixto: 3 km asfalto + 2 km tierra cobra cada tramo con su factor', () {
      // (3 + 2 × 2.5) × 2.696 × 1.4 + 10 × 0.5
      expect(
        tarifaElAlto(kmAsfalto: 3, kmTierra: 2, tiempoDetencionMin: 10),
        closeTo(35.1952, 1e-9),
      );
    });

    test('el mixto queda entre el viaje todo en asfalto y todo en tierra', () {
      final asfalto = tarifaElAlto(kmAsfalto: 5, tiempoDetencionMin: 10);
      final mixto = tarifaElAlto(kmAsfalto: 3, kmTierra: 2, tiempoDetencionMin: 10);
      final tierra = tarifaElAlto(kmTierra: 5, tiempoDetencionMin: 10);
      expect(mixto, greaterThan(asfalto));
      expect(mixto, lessThan(tierra));
    });

    test('sin combustible (Cl=0) reproduce la fórmula anterior', () {
      expect(
        tarifaElAlto(kmTierra: 5, tiempoDetencionMin: 10, consumoLitrosKm: 0),
        closeTo(40.0, 1e-9),
      );
      expect(
        tarifaElAlto(kmAsfalto: 5, tiempoDetencionMin: 0, consumoLitrosKm: 0),
        closeTo(14.0, 1e-9),
      );
    });

    test('viaje de 0 km sin espera cuesta 0', () {
      expect(tarifaElAlto(tiempoDetencionMin: 0), 0);
    });

    test('solo espera: 3 min detenido cobra Ct × Td', () {
      expect(tarifaElAlto(tiempoDetencionMin: 3), closeTo(1.5, 1e-9));
    });
  });

  group('RecorridoPorSuperficie', () {
    test('suma cada tramo a la superficie elegida en ese momento', () {
      final r = RecorridoPorSuperficie()
        ..sumar(1.2, Superficie.asfalto)
        ..sumar(0.5, Superficie.tierra)
        ..sumar(0.3, Superficie.asfalto);
      expect(r.kmAsfalto, closeTo(1.5, 1e-9));
      expect(r.kmTierra, closeTo(0.5, 1e-9));
      expect(r.kmTotal, closeTo(2.0, 1e-9));
    });

    test('cambiar a tierra al final no encarece lo ya recorrido en asfalto', () {
      const p = ParametrosTopograficos.porDefecto;
      final r = RecorridoPorSuperficie()
        ..sumar(4.8, Superficie.asfalto)
        ..sumar(0.2, Superficie.tierra);
      final todoEnTierra = RecorridoPorSuperficie()..sumar(5, Superficie.tierra);
      expect(r.tarifa(p, 0), closeTo((4.8 + 0.2 * 2.5) * 2.696 * 1.4, 1e-9));
      expect(r.tarifa(p, 0), lessThan(todoEnTierra.tarifa(p, 0)));
    });

    test('tipo: asfalto, tierra o mixto según los km', () {
      expect(RecorridoPorSuperficie().tipo, 'asfalto');
      expect((RecorridoPorSuperficie()..sumar(1, Superficie.asfalto)).tipo, 'asfalto');
      expect((RecorridoPorSuperficie()..sumar(1, Superficie.tierra)).tipo, 'tierra');
      expect(
        (RecorridoPorSuperficie()
              ..sumar(1, Superficie.asfalto)
              ..sumar(1, Superficie.tierra))
            .tipo,
        'mixto',
      );
    });

    test('tarifa usa los parámetros de la empresa', () {
      const p = ParametrosTopograficos.porDefecto;
      final r = RecorridoPorSuperficie()
        ..sumar(3, Superficie.asfalto)
        ..sumar(2, Superficie.tierra);
      expect(r.tarifa(p, 10), closeTo(35.1952, 1e-9));
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

  group('nuevoUuid', () {
    test('genera UUID v4 distintos con el formato que valida el servidor', () {
      final formato = RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
      final generados = List.generate(1000, (_) => nuevoUuid());
      expect(generados.every(formato.hasMatch), isTrue);
      expect(generados.toSet().length, 1000);
    });
  });

  group('viajeParaServidor', () {
    test('viaje v4 mixto envía los km por superficie y los parámetros aplicados', () {
      final body = viajeParaServidor({
        'id': 7,
        'chofer_id': 2,
        'distancia_km': 3.5,
        'km_asfalto': 1.5,
        'km_tierra': 2.0,
        'tiempo_detencion_min': 8.5,
        'factor_altitud': 1.4,
        'factor_superficie': 2.5,
        'tarifa_total': 37.27,
        'estado_sincronizacion': 0,
        'fecha_hora': '2026-10-07T10:00:00.000',
        'tipo_superficie': 'mixto',
        'costo_base_km': 2.0,
        'costo_minuto_detencion': 0.5,
        'consumo_litros_km': 0.1,
        'precio_combustible_bs': 6.96,
        'uuid': '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
      });
      expect(body, {
        'uuid': '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
        'distancia_km': 3.5,
        'km_asfalto': 1.5,
        'km_tierra': 2.0,
        'tiempo_detencion_min': 8.5,
        'tarifa_cobrada': 37.27,
        'fecha_hora_viaje': '2026-10-07T10:00:00.000',
        'tipo_superficie': 'mixto',
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
        'km_asfalto': null,
        'km_tierra': null,
      });
      expect(body['tipo_superficie'], 'tierra');
      expect(body.containsKey('km_tierra'), isFalse);
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
