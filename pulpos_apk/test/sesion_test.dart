import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/sesion.dart';
import 'package:shared_preferences/shared_preferences.dart';

String jwt(Map<String, dynamic> payload) {
  String b64(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${b64({'alg': 'HS256', 'typ': 'JWT'})}.${b64(payload)}.firma';
}

int segundos(DateTime t) => t.millisecondsSinceEpoch ~/ 1000;

void main() {
  final ahora = DateTime(2026, 10, 7, 12);

  group('tokenVigente', () {
    test('vigente si exp está en el futuro', () {
      final t = jwt({'id': 2, 'tipo': 'chofer', 'exp': segundos(ahora.add(const Duration(days: 29)))});
      expect(tokenVigente(t, ahora), isTrue);
    });

    test('vencido si exp ya pasó', () {
      final t = jwt({'id': 2, 'exp': segundos(ahora.subtract(const Duration(minutes: 1)))});
      expect(tokenVigente(t, ahora), isFalse);
    });

    test('sin exp, mal formado o basura → no vigente', () {
      expect(tokenVigente(jwt({'id': 2}), ahora), isFalse);
      expect(tokenVigente(jwt({'exp': 'mañana'}), ahora), isFalse);
      expect(tokenVigente('no.es.jwt', ahora), isFalse);
      expect(tokenVigente('abc', ahora), isFalse);
      expect(tokenVigente('', ahora), isFalse);
    });

    test('payload base64url que necesita relleno (=) se decodifica bien', () {
      for (var i = 0; i < 4; i++) {
        final t = jwt({'x': 'a' * i, 'exp': segundos(ahora.add(const Duration(hours: 1)))});
        expect(tokenVigente(t, ahora), isTrue, reason: 'largo $i');
      }
    });
  });

  group('Sesion', () {
    TestWidgetsFlutterBinding.ensureInitialized();

    test('guarda con las claves que usan otros módulos (motor_gps lee jwt_token)', () async {
      SharedPreferences.setMockInitialValues({});
      final t = jwt({'exp': segundos(DateTime.now().add(const Duration(days: 1)))});
      await Sesion.guardar(token: t, choferId: 6, nombre: 'Juancho Quispe');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('jwt_token'), t);
      expect(await Sesion.choferId(), 6);
      expect(await Sesion.nombre(), 'Juancho Quispe');
      expect(await Sesion.tokenValido(), t);
    });

    test('token vencido: tokenValido devuelve null y borra la sesión', () async {
      final vencido = jwt({'exp': segundos(DateTime.now().subtract(const Duration(days: 1)))});
      SharedPreferences.setMockInitialValues({
        'jwt_token': vencido,
        'chofer_id': 6,
        'nombre_chofer': 'Juancho Quispe',
      });
      expect(await Sesion.tokenValido(), isNull);
      expect(await Sesion.choferId(), isNull);
    });

    test('cerrar borra solo la sesión, no otras preferencias (caché de parámetros)', () async {
      SharedPreferences.setMockInitialValues({
        'jwt_token': 'x',
        'chofer_id': 6,
        'nombre_chofer': 'J',
        'parametros_topograficos_v3': '{"id":1}',
      });
      await Sesion.cerrar();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getKeys(), {'parametros_topograficos_v3'});
    });

    test('sin sesión guardada', () async {
      SharedPreferences.setMockInitialValues({});
      expect(await Sesion.tokenValido(), isNull);
      expect(await Sesion.choferId(), isNull);
    });
  });
}
