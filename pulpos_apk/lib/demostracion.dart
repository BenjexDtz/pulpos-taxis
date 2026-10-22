import 'dart:math';

import 'calculadora.dart';

// Modo demostración: un recorrido simulado por El Alto para mostrar el sistema
// sin GPS (defensa, capacitación). Reemplaza al GPS y al acelerómetro; la
// superficie la sigue marcando el chofer y el taxímetro es el mismo.

class TramoDemostracion {
  const TramoDemostracion(this.descripcion, this.superficie, this.segundos, this.kmh, this.rumbo, this.vibracion);

  final String descripcion;
  // La que corresponde al tramo: el chofer debe marcarla, la app no la cambia sola
  final Superficie superficie;
  final int segundos;
  final double kmh;
  final double rumbo; // grados desde el norte
  final double vibracion; // RMS en m/s² cuando el auto avanza
}

class PuntoDemostracion {
  const PuntoDemostracion(this.lat, this.lng, this.segundos, this.vibracion, this.tramo);

  final double lat;
  final double lng;
  final int segundos;
  final double? vibracion;
  final int tramo;
}

class RecorridoDemostracion {
  RecorridoDemostracion({this.tramos = tramosPorDefecto, this.inicioLat = -16.5, this.inicioLng = -68.19})
    : puntos = _generar(tramos, inicioLat, inicioLng);

  static const intervalo = 5;
  // Referencia de vibración del asfalto en la demostración (no se guarda en el teléfono)
  static const referencia = 0.55;
  static const tramosPorDefecto = [
    TramoDemostracion('Avenida asfaltada', Superficie.asfalto, 120, 30, 90, 0.55),
    TramoDemostracion('Semáforo: auto detenido', Superficie.asfalto, 45, 0, 90, 0.55),
    TramoDemostracion('Calle asfaltada', Superficie.asfalto, 60, 25, 0, 0.55),
    TramoDemostracion('Calle de tierra', Superficie.tierra, 150, 15, 45, 1.6),
    TramoDemostracion('Calle empedrada', Superficie.empedrado, 120, 18, 90, 1.3),
    TramoDemostracion('Vuelta a la avenida asfaltada', Superficie.asfalto, 90, 35, 180, 0.55),
  ];

  final List<TramoDemostracion> tramos;
  final double inicioLat;
  final double inicioLng;
  final List<PuntoDemostracion> puntos;

  int get duracion => puntos.last.segundos;

  // Punto 0 = posición inicial; cada tramo avanza en pasos de [intervalo] segundos
  static List<PuntoDemostracion> _generar(List<TramoDemostracion> tramos, double lat, double lng) {
    final puntos = [PuntoDemostracion(lat, lng, 0, null, 0)];
    var segundos = 0;
    var n = 0;
    for (var i = 0; i < tramos.length; i++) {
      final t = tramos[i];
      final metros = t.kmh / 3.6 * intervalo;
      final rumbo = t.rumbo * pi / 180;
      for (var paso = 0; paso < t.segundos ~/ intervalo; paso++) {
        segundos += intervalo;
        n++;
        lat += metros * cos(rumbo) / 111320;
        lng += metros * sin(rumbo) / (111320 * cos(lat * pi / 180));
        // Detenido no hay vibración del camino, como en la app con GPS
        final vibracion = t.kmh / 3.6 < 2 ? null : t.vibracion * (1 + 0.08 * sin(n * 1.7));
        puntos.add(PuntoDemostracion(lat, lng, segundos, vibracion, i));
      }
    }
    return puntos;
  }

  TramoDemostracion tramoEn(int segundos) {
    final siguiente = puntos.firstWhere((p) => p.segundos >= segundos, orElse: () => puntos.last);
    return tramos[siguiente.tramo];
  }
}
