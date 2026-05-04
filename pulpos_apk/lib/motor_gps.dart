import 'dart:async';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class MotorGPS {
  // ─── Configuración ────────────────────────────────────────────────────────
  // ⚠️ Cambia esta IP por la de tu servidor cuando lo subas a la nube.
  static const String _urlBase = 'http://192.168.0.102:3000';

  // Cada cuántas posiciones GPS enviar al servidor (10 = cada ~10 segundos)
  static const int _intervaloEnvio = 10;
  static int _contadorPosiciones = 0;

  // ─── Permisos y posición inicial ──────────────────────────────────────────
  static Future<Position?> obtenerUbicacionActual() async {
    bool servicioHabilitado = await Geolocator.isLocationServiceEnabled();
    if (!servicioHabilitado) return null;

    LocationPermission permiso = await Geolocator.checkPermission();
    if (permiso == LocationPermission.denied) {
      permiso = await Geolocator.requestPermission();
      if (permiso == LocationPermission.denied) return null;
    }
    if (permiso == LocationPermission.deniedForever) return null;

    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );
  }

  // ─── Stream GPS con envío de posición al servidor ─────────────────────────
  static Stream<Position> obtenerFlujoUbicacion() {
    late LocationSettings locationSettings;

    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10, // metros mínimos antes de emitir nueva posición
        forceLocationManager: true,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationText: 'Calculando tarifa y distancia...',
          notificationTitle: 'Radio Taxis Pulpos Activo 🚖',
          enableWakeLock: true,
        ),
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      );
    }

    // Envolvemos el stream original para añadir el envío GPS
    return Geolocator.getPositionStream(locationSettings: locationSettings).map(
      (Position posicion) {
        _contadorPosiciones++;

        // Enviar al servidor cada N posiciones (sin bloquear el stream)
        if (_contadorPosiciones % _intervaloEnvio == 0) {
          _enviarPosicionAlServidor(posicion.latitude, posicion.longitude);
        }

        return posicion;
      },
    );
  }

  // ─── Envío de posición al servidor ────────────────────────────────────────
  static Future<void> _enviarPosicionAlServidor(double lat, double lng) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('jwt_token');

      if (token == null) return; // No hay sesión activa

      await http.post(
        Uri.parse('$_urlBase/api/posicion'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'lat': lat, 'lng': lng}),
      );

      // No lanzamos error si falla — el cálculo offline sigue igual
    } catch (_) {
      // Silencioso: puede no haber internet en zonas periféricas
    }
  }

  // ─── Envío manual (al finalizar el viaje) ─────────────────────────────────
  /// Llama esto cuando el conductor termina el viaje para asegurarte
  /// de que la última posición quede registrada en el servidor.
  static Future<void> enviarUltimaPosicion(Position posicion) async {
    await _enviarPosicionAlServidor(posicion.latitude, posicion.longitude);
  }

  // ─── Reset del contador (al iniciar nuevo viaje) ──────────────────────────
  static void resetContador() {
    _contadorPosiciones = 0;
  }
}
