import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:pulpos_tarifa_core/taximetro.dart';

void main() {
  // Ejemplo de referencia: B 5,00; 3,00/km; 30,00/h; saltos de 0,50; la tierra con F = 1,25
  const referencia = TarifaTaximetro(
    modo: ModoTarifa.s,
    bajada: 500,
    salto: 50,
    porKm: {Superficie.asfalto: 300000, Superficie.tierra: 375000, Superficie.empedrado: 300000},
    porHora: 3000000,
  );
  const inicio = PuntoRuta(-16.5, -68.19, 0, Superficie.asfalto);

  Taximetro ocupado([TarifaTaximetro t = referencia]) => Taximetro(t)..ocupar(inicio);

  group('modo S (Directiva 2014/32/UE, Anexo IX)', () {
    int recorrer(Superficie superficie) {
      final t = ocupado();
      for (var i = 0; i < 10; i++) {
        t.tramo(200000, 24, Superficie.asfalto); // 2 km a 30 km/h
      }
      for (var i = 0; i < 10; i++) {
        t.tramo(100000, 24, superficie); // 1 km a 15 km/h
      }
      t.tramo(0, 180, Superficie.asfalto); // 3 min detenido
      return t.centavos;
    }

    test('ejemplo de referencia: 16,00 con tierra y 15,50 todo en asfalto', () {
      expect(recorrer(Superficie.tierra), 1600);
      expect(recorrer(Superficie.asfalto), 1550);
    });

    test('la velocidad de cruce baja con F > 1', () {
      expect(referencia.velocidadCruceKmh(), 10);
      expect(referencia.velocidadCruceKmh(Superficie.tierra), 8);
    });

    test('sobre la velocidad de cruce solo cuenta la distancia; debajo, solo el tiempo', () {
      final rapido = ocupado()..tramo(1000000, 180, Superficie.asfalto); // 20 km/h
      expect([rapido.centavos, rapido.minutosPorTiempo, rapido.ultimoTramoPorTiempo], [800, 0, false]);
      final lento = ocupado()..tramo(100000, 360, Superficie.asfalto); // 1 km/h
      expect([lento.centavos, lento.minutosPorTiempo, lento.ultimoTramoPorTiempo], [800, 6, true]);
    });

    test('modo D suma ambos componentes', () {
      const d = TarifaTaximetro(
        modo: ModoTarifa.d,
        bajada: 500,
        salto: 50,
        porKm: {Superficie.asfalto: 300000, Superficie.tierra: 375000, Superficie.empedrado: 300000},
        porHora: 3000000,
      );
      expect((ocupado(d)..tramo(1000000, 180, Superficie.asfalto)).centavos, 500 + 300 + 150);
    });

    test('detenido, la superficie no cambia el importe', () {
      for (final s in Superficie.values) {
        expect((ocupado()..tramo(0, 600, s)).centavos, 1000);
      }
    });

    test('dos horas de tramos de 1 s no pierden precisión', () {
      final t = ocupado();
      for (var i = 0; i < 7200; i++) {
        t.tramo(10000, 1, Superficie.asfalto); // 72 km a 36 km/h
      }
      expect(t.centavos, 500 + 72 * 300);
    });

    test('mientras no llega otro punto el importe sube con el tiempo y nunca baja', () {
      final t = ocupado();
      expect(t.centavosEn(0), 500);
      expect(t.centavosEn(59), 500);
      expect(t.centavosEn(60), 550);
      t.registrar(const PuntoRuta(-16.5, -68.19, 60, Superficie.asfalto));
      expect(t.centavos, 550);
    });
  });

  group('estados LIBRE → OCUPADO → A_PAGAR → LIBRE', () {
    test('transiciones inválidas se rechazan', () {
      final t = Taximetro(referencia);
      expect(() => t.registrar(inicio), throwsA(isA<TransicionInvalida>()));
      expect(() => t.cobrar(10, Superficie.asfalto), throwsA(isA<TransicionInvalida>()));
      expect(t.liberar, throwsA(isA<TransicionInvalida>()));
      t.ocupar(inicio);
      expect(() => t.ocupar(inicio), throwsA(isA<TransicionInvalida>()));
      t.cobrar(120, Superficie.asfalto);
      expect(t.estado, EstadoTaximetro.aPagar);
      expect(() => t.ocupar(inicio), throwsA(isA<TransicionInvalida>()));
      expect(() => t.registrar(inicio), throwsA(isA<TransicionInvalida>()));
    });

    test('en A_PAGAR el importe queda congelado', () {
      final t = ocupado()..cobrar(120, Superficie.asfalto);
      expect(t.centavos, 600);
      expect(t.centavosEn(100000), 600);
    });

    test('cobrar cierra el último tramo en el lugar del último punto', () {
      final t = ocupado()..cobrar(120, Superficie.tierra);
      expect(t.ruta.length, 2);
      expect([t.ruta.last.lat, t.ruta.last.lng, t.ruta.last.segundos], [-16.5, -68.19, 120]);
      expect(t.recorrido.kmTotal, 0);
    });

    test('al volver a LIBRE el siguiente viaje empieza de cero', () {
      final t = ocupado()
        ..cobrar(600, Superficie.asfalto)
        ..liberar()
        ..ocupar(inicio);
      expect([t.centavos, t.ruta.length, t.minutosPorTiempo], [500, 1, 0]);
    });

    test('un punto anterior al último se rechaza', () {
      final t = ocupado()..registrar(const PuntoRuta(-16.5, -68.19, 30, Superficie.asfalto));
      expect(
        () => t.registrar(const PuntoRuta(-16.5, -68.19, 10, Superficie.asfalto)),
        throwsArgumentError,
      );
    });
  });

  // Mismo caso en verificacion.test.js e integracion.test.js: la app y el servidor dan lo mismo
  group('caso compartido con el servidor', () {
    const pulpos = ParametrosTopograficos(
      id: 1,
      zonaCiudad: 'El Alto',
      costoBaseKm: 2,
      consumoLitrosKm: 0.1,
      precioCombustibleBs: 6.96,
      factorAltitud: 1.4,
      factorSuperficie: 2.5,
      factorEmpedrado: 2,
      costoMinutoDetencion: 0.5,
      bajadaBandera: 2,
      valorSalto: 0.5,
    );
    List<PuntoRuta> ruta() => [
      for (var i = 0; i <= 20; i++)
        PuntoRuta(-16.5, -68.19 + i * 0.0005, i * 6, i > 15 ? Superficie.tierra : Superficie.asfalto),
    ];

    Taximetro recorrer(ParametrosTopograficos p) {
      final puntos = ruta();
      final t = Taximetro(TarifaTaximetro.desde(p))..ocupar(puntos.first);
      for (final punto in puntos.skip(1)) {
        t.registrar(punto);
      }
      return t..cobrar(240, Superficie.tierra);
    }

    test('tarifas enteras iguales a tarifasEnteras de verificacion.js', () {
      final t = TarifaTaximetro.desde(pulpos);
      expect([t.bajada, t.salto, t.porHora], [200, 50, 3000000]);
      expect(t.porKm, {Superficie.asfalto: 377440, Superficie.tierra: 943600, Superficie.empedrado: 754880});
    });

    test('modo S: 8,50 con 2 min cobrados por tiempo; modo D: 9,50', () {
      final s = recorrer(pulpos);
      expect([s.centavos, s.minutosPorTiempo], [850, 2]);
      // Los mismos km, bit a bit, que resumenRuta del servidor
      expect(s.recorrido.kmAsfalto, 0.799619175629248);
      expect(s.recorrido.kmTierra, 0.26653972520974933);
      final d = ParametrosTopograficos.fromJson({...pulpos.toJson(), 'modo_tarifa': 'D'});
      expect(recorrer(d).centavos, 950);
    });

    test('recalcular desde la ruta guardada da el mismo importe (recuperación tras un cierre)', () {
      final vivo = recorrer(pulpos);
      final recuperado = Taximetro.desdeRuta(TarifaTaximetro.desde(pulpos), vivo.ruta);
      expect([recuperado.centavos, recuperado.minutosPorTiempo, recuperado.recorrido.kmTotal],
          [vivo.centavos, vivo.minutosPorTiempo, vivo.recorrido.kmTotal]);
      expect(recuperado.estado, EstadoTaximetro.ocupado);
    });
  });

  test('el viaje envía el modo, la bajada y el salto aplicados', () {
    final body = viajeParaServidor({
      'distancia_km': 1.0,
      'tarifa_total': 8.5,
      'modo_tarifa': 'S',
      'bajada_bandera': 2.0,
      'valor_salto': 0.5,
    });
    expect([body['modo_tarifa_aplicado'], body['bajada_bandera_aplicada'], body['valor_salto_aplicado']], ['S', 2.0, 0.5]);
    expect(viajeParaServidor({'distancia_km': 1.0}).containsKey('modo_tarifa_aplicado'), isFalse);
  });
}
