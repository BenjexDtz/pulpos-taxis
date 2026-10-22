import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';

void main() {
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

    test('lee bajada, salto y modo del taxímetro; sin ellos usa 0, 0,10 y S', () {
      final base = {
        'id': 1,
        'zona_ciudad': 'x',
        'costo_base_km': '2.00',
        'factor_altitud': '1.40',
        'factor_superficie': '2.50',
        'costo_minuto_detencion': '0.50',
      };
      final p = ParametrosTopograficos.fromJson({
        ...base,
        'bajada_bandera_bs': '2.50',
        'valor_salto_bs': '0.20',
        'modo_tarifa': 'D',
      });
      expect([p.bajadaBandera, p.valorSalto, p.modoTarifa], [2.5, 0.2, ModoTarifa.d]);
      final viejo = ParametrosTopograficos.fromJson(base);
      expect([viejo.bajadaBandera, viejo.valorSalto, viejo.modoTarifa], [0, 0.1, ModoTarifa.s]);
    });

    test('toJson se vuelve a leer igual (copia del viaje en curso)', () {
      const p = ParametrosTopograficos.porDefecto;
      final copia = ParametrosTopograficos.fromJson(p.toJson());
      expect(copia.toJson(), p.toJson());
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

  group('empedrado', () {
    test('el recorrido suma los km de empedrado y decide el tipo', () {
      final solo = RecorridoPorSuperficie()..sumar(1, Superficie.empedrado);
      expect(solo.tipo, 'empedrado');
      final tres = RecorridoPorSuperficie()
        ..sumar(2, Superficie.asfalto)
        ..sumar(1, Superficie.tierra)
        ..sumar(2, Superficie.empedrado);
      expect([tres.kmEmpedrado, tres.kmTotal, tres.tipo], [2, 5, 'mixto']);
    });

    test('lee FE del servidor; si no viene usa 1.5', () {
      final base = {
        'id': 1,
        'zona_ciudad': 'x',
        'costo_base_km': '2.00',
        'factor_altitud': '1.40',
        'factor_superficie': '2.50',
        'costo_minuto_detencion': '0.50',
      };
      expect(ParametrosTopograficos.fromJson({...base, 'factor_empedrado': '1.80'}).factorEmpedrado, 1.8);
      expect(ParametrosTopograficos.fromJson(base).factorEmpedrado, 1.5);
    });

    test('el viaje envía los km y el FE aplicado; la ruta usa el código 2', () {
      final body = viajeParaServidor(
        {
          'distancia_km': 3.0,
          'km_asfalto': 1.0,
          'km_tierra': 0.0,
          'km_empedrado': 2.0,
          'factor_superficie': 2.5,
          'factor_empedrado': 1.8,
          'tipo_superficie': 'mixto',
        },
        ruta: const [PuntoRuta(-16.5, -68.19, 0, Superficie.empedrado)],
      );
      expect(body['km_empedrado'], 2.0);
      expect(body['factor_empedrado_aplicado'], 1.8);
      expect(body['ruta'], [
        [-16.5, -68.19, 0, 2],
      ]);
    });

    test('PuntoRuta conserva el empedrado al pasar por SQLite', () {
      const p = PuntoRuta(-16.5, -68.19, 3, Superficie.empedrado);
      final fila = p.paraSqlite('u', 0);
      expect(fila['superficie'], 2);
      expect(PuntoRuta.desdeSqlite(fila).superficie, Superficie.empedrado);
    });
  });

  group('tarifa sin taxímetro', () {
    test('leerMonto acepta coma o punto y descarta lo que no es un monto', () {
      expect(leerMonto('15'), 15);
      expect(leerMonto(' 12,50 '), 12.5);
      for (final malo in ['', 'diez', '0', '-3', '20000']) {
        expect(leerMonto(malo), isNull, reason: malo);
      }
    });

    test('se envía solo si el chofer la respondió', () {
      expect(viajeParaServidor({'tarifa_tradicional': 15.0})['tarifa_tradicional'], 15.0);
      expect(viajeParaServidor({'tarifa_tradicional': null}).containsKey('tarifa_tradicional'), isFalse);
    });
  });
}
