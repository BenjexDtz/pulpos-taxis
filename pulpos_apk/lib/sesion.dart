import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Sesión del chofer guardada en el teléfono (SharedPreferences).
/// Las claves son las mismas que ya leen otros módulos (p. ej. motor_gps).
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

  /// Token guardado si sigue vigente; si venció, lo borra y devuelve null.
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

  /// Borra solo la sesión. Los viajes en SQLite NO se tocan: los pendientes
  /// se sincronizan cuando ese mismo chofer vuelva a iniciar sesión.
  static Future<void> cerrar() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_claveToken);
    await prefs.remove(_claveChofer);
    await prefs.remove(_claveNombre);
  }
}

/// Lee el `exp` del JWT para saber si venció. No verifica la firma (eso lo hace
/// el servidor en cada petición): solo evita entrar al taxímetro con una sesión
/// vencida. Un token mal formado o sin `exp` se considera no vigente.
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
