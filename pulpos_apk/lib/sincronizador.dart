import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_sync.dart';
import 'base_datos.dart';
import 'config.dart';

class ResultadoSincronizacion {
  const ResultadoSincronizacion({
    required this.enviados,
    required this.pendientes,
    this.sesionRechazada = false,
  });

  final int enviados;
  final int pendientes;
  final bool sesionRechazada;
}

class Sincronizador {
  Sincronizador({
    required this.viajesPendientes,
    required this.puntosDeViaje,
    required this.marcarSincronizado,
    http.Client? cliente,
    this.url = urlServidor,
  }) : _cliente = cliente ?? http.Client();

  factory Sincronizador.local() => Sincronizador(
    viajesPendientes: BaseDatosLocal.instancia.viajesPendientes,
    puntosDeViaje: BaseDatosLocal.instancia.puntosDeViaje,
    marcarSincronizado: BaseDatosLocal.instancia.marcarSincronizado,
  );

  final Future<List<Map<String, dynamic>>> Function(int choferId)
  viajesPendientes;
  final Future<List<PuntoRuta>> Function(String? uuid) puntosDeViaje;
  final Future<void> Function(Map<String, dynamic> viaje) marcarSincronizado;
  final String url;
  final http.Client _cliente;
  bool _enCurso = false;

  bool get enCurso => _enCurso;

  // null si ya hay una sincronización en curso (automática y manual a la vez)
  Future<ResultadoSincronizacion?> ejecutar({
    required String token,
    required int choferId,
  }) async {
    if (_enCurso) return null;
    _enCurso = true;
    try {
      final pendientes = await viajesPendientes(choferId);
      var enviados = 0;
      for (final viaje in pendientes) {
        final ruta = await puntosDeViaje(viaje['uuid'] as String?);
        final r = await _enviar(token, viajeParaServidor(viaje, ruta: ruta));
        // Sin red: los demás viajes también fallarían, se reintenta luego
        if (r == null) break;
        // 200: el servidor ya tenía este viaje (reintento)
        if (r.statusCode == 201 || r.statusCode == 200) {
          await marcarSincronizado(viaje);
          enviados++;
        } else if (r.statusCode == 401 || r.statusCode == 403) {
          return ResultadoSincronizacion(
            enviados: enviados,
            pendientes: pendientes.length - enviados,
            sesionRechazada: true,
          );
        }
      }
      return ResultadoSincronizacion(
        enviados: enviados,
        pendientes: pendientes.length - enviados,
      );
    } finally {
      _enCurso = false;
    }
  }

  Future<http.Response?> _enviar(String token, Map<String, dynamic> cuerpo) async {
    try {
      return await _cliente
          .post(
            Uri.parse('$url/api/viajes/sincronizar'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode(cuerpo),
          )
          .timeout(const Duration(seconds: 20));
    } catch (_) {
      return null;
    }
  }
}
