import 'dart:async';
import 'dart:convert';
import 'package:geolocator/geolocator.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';

enum FallaGPS {
  apagado('Activa la ubicación (GPS) del teléfono para iniciar el viaje.'),
  sinPermiso('El taxímetro necesita permiso de ubicación para medir el viaje.'),
  bloqueado('El permiso de ubicación está bloqueado. Actívalo en los ajustes de la app.'),
  aproximada('Activa "Ubicación precisa" en los permisos de la app: con la aproximada no se mide la distancia.'),
  sinSenal('Sin señal GPS. Sal al aire libre o acércate a una ventana e intenta de nuevo.');

  const FallaGPS(this.mensaje);
  final String mensaje;
  bool get abreAjustesApp => this == bloqueado || this == aproximada;
}

class MotorGPS {
  // ─── Configuración ────────────────────────────────────────────────────────
  // Cada cuántas posiciones GPS enviar al servidor (10 = cada ~10 segundos)
  static const int _intervaloEnvio = 10;
  static int _contadorPosiciones = 0;

  // ─── Permisos y posición inicial ──────────────────────────────────────────
  // Devuelve la posición o el motivo por el que no se pudo obtener, para mostrárselo al chofer
  static Future<(Position?, FallaGPS?)> obtenerUbicacionActual() async {
    if (!await Geolocator.isLocationServiceEnabled()) return (null, FallaGPS.apagado);

    LocationPermission permiso = await Geolocator.checkPermission();
    if (permiso == LocationPermission.denied) {
      permiso = await Geolocator.requestPermission();
      if (permiso == LocationPermission.denied) return (null, FallaGPS.sinPermiso);
    }
    if (permiso == LocationPermission.deniedForever) return (null, FallaGPS.bloqueado);
    // Con ubicación aproximada ninguna lectura baja de 20 m y el taxímetro no sumaría distancia
    if (await Geolocator.getLocationAccuracy() == LocationAccuracyStatus.reduced) {
      return (null, FallaGPS.aproximada);
    }

    try {
      return (
        await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 20),
          ),
        ),
        null,
      );
    } on TimeoutException {
      final ultima = await Geolocator.getLastKnownPosition();
      return ultima == null ? (null, FallaGPS.sinSenal) : (ultima, null);
    }
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
          notificationTitle: 'Taxímetro activo 🚖',
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
        Uri.parse('$urlServidor/api/posicion'),
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
  static Future<void> enviarUltimaPosicion(double lat, double lng) async {
    await _enviarPosicionAlServidor(lat, lng);
  }

  // ─── Reset del contador (al iniciar nuevo viaje) ──────────────────────────
  static void resetContador() {
    _contadorPosiciones = 0;
  }
}
