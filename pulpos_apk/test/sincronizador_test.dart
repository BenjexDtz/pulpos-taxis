import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:pulpos_tarifa_core/sincronizador.dart';

Map<String, dynamic> viaje(int id) => {
  'id': id,
  'uuid': 'uuid-$id',
  'distancia_km': 1.0,
  'tiempo_detencion_min': 0.0,
  'tarifa_total': 5.0,
  'fecha_hora': '2026-10-09T10:00:00.000',
};

void main() {
  group('Sincronizador', () {
    late List<Map<String, dynamic>> pendientes;
    late List<int> marcados;
    late List<Map<String, dynamic>> enviados;

    Sincronizador crear(Future<http.Response> Function(http.Request) responder) {
      return Sincronizador(
        viajesPendientes: (_) async => pendientes,
        puntosDeViaje: (uuid) async => [
          const PuntoRuta(-16.5, -68.19, 0, Superficie.asfalto),
          const PuntoRuta(-16.5, -68.1895, 6, Superficie.tierra),
        ],
        marcarSincronizado: (v) async => marcados.add(v['id'] as int),
        url: 'https://central.test',
        cliente: MockClient((req) {
          enviados.add(jsonDecode(req.body) as Map<String, dynamic>);
          return responder(req);
        }),
      );
    }

    setUp(() {
      pendientes = [viaje(1), viaje(2)];
      marcados = [];
      enviados = [];
    });

    test('envía cada viaje con su ruta y marca los confirmados (201 o 200)', () async {
      var n = 0;
      final s = crear((req) async {
        expect(req.url.toString(), 'https://central.test/api/viajes/sincronizar');
        expect(req.headers['Authorization'], 'Bearer tok');
        return http.Response('{}', n++ == 0 ? 201 : 200);
      });
      final r = await s.ejecutar(token: 'tok', choferId: 7);
      expect([r!.enviados, r.pendientes, r.sesionRechazada], [2, 0, false]);
      expect(marcados, [1, 2]);
      expect(enviados.first['ruta'], [
        [-16.5, -68.19, 0, 0],
        [-16.5, -68.1895, 6, 1],
      ]);
    });

    test('un error del servidor deja ese viaje pendiente y sigue con el resto', () async {
      var n = 0;
      final s = crear((_) async => http.Response('{}', n++ == 0 ? 500 : 201));
      final r = await s.ejecutar(token: 'tok', choferId: 7);
      expect([r!.enviados, r.pendientes], [1, 1]);
      expect(marcados, [2]);
    });

    test('sin red se detiene en el primer intento y no marca nada', () async {
      final s = crear((_) async => throw http.ClientException('sin red'));
      final r = await s.ejecutar(token: 'tok', choferId: 7);
      expect([r!.enviados, r.pendientes], [0, 2]);
      expect(enviados.length, 1);
      expect(marcados, isEmpty);
    });

    test('401 o 403 corta y avisa que la sesión fue rechazada', () async {
      final s = crear((_) async => http.Response('{}', 403));
      final r = await s.ejecutar(token: 'tok', choferId: 7);
      expect([r!.enviados, r.pendientes, r.sesionRechazada], [0, 2, true]);
      expect(enviados.length, 1);
    });

    test('una segunda sincronización mientras corre la primera no se ejecuta', () async {
      final liberar = Completer<void>();
      final s = crear((_) async {
        await liberar.future;
        return http.Response('{}', 201);
      });
      final primera = s.ejecutar(token: 'tok', choferId: 7);
      expect(s.enCurso, isTrue);
      expect(await s.ejecutar(token: 'tok', choferId: 7), isNull);
      liberar.complete();
      expect((await primera)!.enviados, 2);
      expect(s.enCurso, isFalse);
    });
  });

  group('PuntoRuta', () {
    test('al servidor va compacto y redondeado a 6 decimales', () {
      const p = PuntoRuta(-16.123456789, -68.987654321, 12, Superficie.tierra);
      expect(p.paraServidor(), [-16.123457, -68.987654, 12, 1]);
    });

    test('ida y vuelta por SQLite conserva los datos', () {
      const p = PuntoRuta(-16.5, -68.19, 30, Superficie.tierra);
      final fila = p.paraSqlite('u-1', 4);
      expect(fila['viaje_uuid'], 'u-1');
      expect(fila['orden'], 4);
      final q = PuntoRuta.desdeSqlite(fila);
      expect([q.lat, q.lng, q.segundos, q.superficie], [-16.5, -68.19, 30, Superficie.tierra]);
    });

    test('viajeParaServidor solo incluye la ruta si hay puntos', () {
      expect(viajeParaServidor(viaje(1)).containsKey('ruta'), isFalse);
      final body = viajeParaServidor(viaje(1), ruta: const [PuntoRuta(-16.5, -68.19, 0, Superficie.asfalto)]);
      expect(body['ruta'], [
        [-16.5, -68.19, 0, 0],
      ]);
    });
  });
}
