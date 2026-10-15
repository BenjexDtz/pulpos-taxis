import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:pulpos_tarifa_core/rugosidad.dart';

// Teléfono quieto con gravedad en z y una vibración senoidal de amplitud `a`
void alimentar(MedidorVibracion m, double a, {int n = 200, double gx = 0, double gz = 9.81}) {
  for (var i = 0; i < n; i++) {
    m.registrar(gx, 0, gz + a * sin(i * 0.9));
  }
}

void main() {
  group('MedidorVibracion', () {
    test('sin vibración el RMS es casi 0', () {
      final m = MedidorVibracion();
      alimentar(m, 0);
      expect(m.tomar(), closeTo(0, 1e-9));
    });

    test('el RMS crece con la vibración (senoide: amplitud / √2)', () {
      final m = MedidorVibracion();
      alimentar(m, 0, n: 300);
      m.tomar();
      alimentar(m, 2);
      expect(m.tomar(), closeTo(2 / sqrt2, 0.15));
    });

    test('no depende de cómo esté montado el teléfono', () {
      final vertical = MedidorVibracion();
      final inclinado = MedidorVibracion();
      for (var i = 0; i < 400; i++) {
        final v = 1.5 * sin(i * 0.9);
        vertical.registrar(0, 0, 9.81 + v);
        // Misma vibración a lo largo de la gravedad, con el teléfono a 45°
        inclinado.registrar((9.81 + v) / sqrt2, 0, (9.81 + v) / sqrt2);
      }
      expect(inclinado.tomar(), closeTo(vertical.tomar()!, 1e-6));
    });

    test('con pocas lecturas no informa nada y cada toma empieza de cero', () {
      final m = MedidorVibracion();
      alimentar(m, 1, n: 5);
      expect(m.tomar(), isNull);
      expect(m.tomar(), isNull);
    });
  });

  group('SugerenciaSuperficie', () {
    List<Sugerencia> recorrer(SugerenciaSuperficie s, double vibracion, Superficie marcada, int puntos) =>
        [for (var i = 0; i < puntos; i++) s.registrar(vibracion, marcada)];

    test('asfalto liso no sugiere nada', () {
      final s = SugerenciaSuperficie(referencia: 0.5);
      expect(recorrer(s, 0.5, Superficie.asfalto, 20).toSet(), {Sugerencia.ninguna});
    });

    test('marcado asfalto en camino que vibra el doble: sugiere irregular tras la ventana', () {
      final s = SugerenciaSuperficie(referencia: 0.5);
      final r = recorrer(s, 1.2, Superficie.asfalto, 8);
      expect(r.sublist(0, 7).toSet(), {Sugerencia.ninguna});
      expect(r.last, Sugerencia.caminoIrregular);
    });

    test('marcado tierra o empedrado en camino liso: sugiere asfalto', () {
      for (final marcada in [Superficie.tierra, Superficie.empedrado]) {
        final s = SugerenciaSuperficie(referencia: 0.5);
        expect(recorrer(s, 0.55, marcada, 8).last, Sugerencia.caminoLiso);
      }
    });

    test('tierra que vibra como tierra no sugiere nada', () {
      final s = SugerenciaSuperficie(referencia: 0.5);
      expect(recorrer(s, 1.5, Superficie.tierra, 20).toSet(), {Sugerencia.ninguna});
    });

    test('al cambiar de superficie la ventana empieza de nuevo', () {
      final s = SugerenciaSuperficie(referencia: 0.5);
      recorrer(s, 1.5, Superficie.tierra, 7);
      expect(recorrer(s, 0.5, Superficie.asfalto, 7).toSet(), {Sugerencia.ninguna});
    });

    test('descartar silencia el aviso durante un tramo', () {
      final s = SugerenciaSuperficie(referencia: 0.5, puntosEspera: 10);
      expect(recorrer(s, 1.2, Superficie.asfalto, 8).last, Sugerencia.caminoIrregular);
      s.descartar();
      final r = recorrer(s, 1.2, Superficie.asfalto, 11);
      expect(r.sublist(0, 10).toSet(), {Sugerencia.ninguna});
      expect(r.last, Sugerencia.caminoIrregular);
    });

    test('puntos sin lectura no cuentan', () {
      final s = SugerenciaSuperficie(referencia: 0.5);
      for (var i = 0; i < 20; i++) {
        expect(s.registrar(null, Superficie.asfalto), Sugerencia.ninguna);
      }
      expect(s.vibracionReciente, isNull);
    });

    test('aprende la referencia solo en asfalto que parece asfalto', () {
      final s = SugerenciaSuperficie(referencia: 0.5);
      recorrer(s, 0.7, Superficie.asfalto, 40);
      expect(s.referencia, greaterThan(0.6));
      final antes = s.referencia;
      recorrer(s, 2.5, Superficie.asfalto, 40);
      recorrer(s, 0.2, Superficie.tierra, 40);
      expect(s.referencia, antes);
    });

    test('la referencia guardada se limita a valores razonables', () {
      expect(SugerenciaSuperficie(referencia: 50).referencia, SugerenciaSuperficie.referenciaMaxima);
      expect(SugerenciaSuperficie(referencia: 0).referencia, SugerenciaSuperficie.referenciaMinima);
      expect(SugerenciaSuperficie().referencia, SugerenciaSuperficie.referenciaInicial);
    });
  });

  group('PuntoRuta con vibración', () {
    test('se guarda en SQLite y se envía con 2 decimales como quinto elemento', () {
      const p = PuntoRuta(-16.5, -68.19, 4, Superficie.tierra, 1.23456);
      expect(PuntoRuta.desdeSqlite(p.paraSqlite('u', 1)).vibracion, 1.23456);
      expect(p.paraServidor(), [-16.5, -68.19, 4, 1, 1.23]);
    });

    test('sin lectura se envía con 4 elementos, como las versiones previas', () {
      const p = PuntoRuta(-16.5, -68.19, 0, Superficie.asfalto);
      expect(p.paraSqlite('u', 0)['vibracion'], isNull);
      expect(p.paraServidor(), [-16.5, -68.19, 0, 0]);
    });
  });
}
