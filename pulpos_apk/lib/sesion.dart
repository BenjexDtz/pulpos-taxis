import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class Sesion {
  static const _claveToken = 'jwt_token';
  static const _claveChofer = 'chofer_id';
  static const _claveNombre = 'nombre_chofer';

  static Future<void> guardar({
    required String token,
    required int choferId,
    required String nombre,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_claveToken, token);
    await prefs.setInt(_claveChofer, choferId);
    await prefs.setString(_claveNombre, nombre);
  }

  static Future<String?> tokenValido() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_claveToken);
    if (token != null && tokenVigente(token, DateTime.now())) return token;
    if (token != null) await cerrar();
    return null;
  }

  static Future<int?> choferId() async =>
      (await SharedPreferences.getInstance()).getInt(_claveChofer);

  static Future<String?> nombre() async =>
      (await SharedPreferences.getInstance()).getString(_claveNombre);

  static Future<void> cerrar() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_claveToken);
    await prefs.remove(_claveChofer);
    await prefs.remove(_claveNombre);
  }
}

// Solo lee exp; la firma la valida el servidor
bool tokenVigente(String token, DateTime ahora) {
  final partes = token.split('.');
  if (partes.length != 3) return false;
  try {
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(partes[1]))),
    );
    final exp = payload is Map ? payload['exp'] : null;
    if (exp is! num) return false;
    final vence = DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
    return ahora.isBefore(vence);
  } catch (_) {
    return false;
  }
}
