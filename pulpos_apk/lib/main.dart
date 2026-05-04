import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'motor_gps.dart';
import 'calculadora.dart';
import 'base_datos.dart';
import 'pantalla_historial.dart';
import 'pantalla_login.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

void main() {
  runApp(const AplicacionPulpos());
}

class AplicacionPulpos extends StatelessWidget {
  const AplicacionPulpos({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Radio Taxis Pulpos',
      theme: ThemeData(primarySwatch: Colors.blue, fontFamily: 'Roboto'),
      home: const PantallaLogin(),
    );
  }
}

class PantallaPrueba extends StatefulWidget {
  const PantallaPrueba({super.key});

  @override
  State<PantallaPrueba> createState() => _PantallaPruebaState();
}

class _PantallaPruebaState extends State<PantallaPrueba> {
  // ── GPS y métricas del viaje ───────────────────────────────────────────────
  double distanciaTotalKm = 0.0;
  Position? posicionAnterior;
  bool enViaje = false;
  StreamSubscription<Position>? suscripcionGPS;
  int segundosDetencion = 0;
  Timer? relojDetencion;
  bool estaDetenido = false;

  // ── Parámetros topográficos (desde servidor) ───────────────────────────────
  ParametrosTopograficos? _params;
  bool _cargandoParams = true;

  // Factor de superficie elegido por el conductor (1.0 asfalto / 2.5 tierra)
  double fSuperficie = 1.0;

  @override
  void initState() {
    super.initState();
    _cargarParametros();
  }

  // 🔥 Descarga los parámetros del servidor al iniciar la pantalla
  Future<void> _cargarParametros() async {
    setState(() => _cargandoParams = true);
    final params = await ParametrosService.obtener();
    setState(() {
      _params = params;
      _cargandoParams = false;
    });
  }

  // ── Sincronización de viajes ───────────────────────────────────────────────
  Future<void> sincronizarViajesPendientes() async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('🔄 Sincronizando viajes con la central...'),
      ),
    );

    const String urlBase = 'http://192.168.0.9:3000'; // ⚠️ Cambia tu IP

    final db = await BaseDatosLocal.instancia.database;
    final pendientes = await db.query(
      'viajes',
      where: 'estado_sincronizacion = ?',
      whereArgs: [0],
    );

    if (pendientes.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Todo al día. No hay viajes pendientes.'),
          ),
        );
      }
      return;
    }

    int enviados = 0;
    for (var viaje in pendientes) {
      try {
        final response = await http.post(
          Uri.parse('$urlBase/api/viajes/sincronizar'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'chofer_id': viaje['chofer_id'],
            'distancia_km': viaje['distancia_km'],
            'tiempo_detencion_min': viaje['tiempo_detencion_min'],
            'tarifa_cobrada': viaje['tarifa_total'],
            'fecha_hora_viaje': viaje['fecha_hora'],
          }),
        );
        if (response.statusCode == 201) {
          await db.update(
            'viajes',
            {'estado_sincronizacion': 1},
            where: 'id = ?',
            whereArgs: [viaje['id']],
          );
          enviados++;
        }
      } catch (e) {
        print("Error de red: $e");
      }
    }

    if (mounted && enviados > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('📡 Éxito: $enviados viaje(s) subidos a gerencia.'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  // ── Control del viaje ──────────────────────────────────────────────────────
  void _iniciarRelojDetencion() {
    relojDetencion = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (enViaje && posicionAnterior != null) {
        if (posicionAnterior!.speed < 0.5) {
          setState(() {
            segundosDetencion++;
            estaDetenido = true;
          });
        } else {
          setState(() {
            estaDetenido = false;
          });
        }
      }
    });
  }

  void iniciarRastreo() async {
    final posInicial = await MotorGPS.obtenerUbicacionActual();
    if (posInicial == null) return;

    MotorGPS.resetContador();
    setState(() {
      distanciaTotalKm = 0.0;
      segundosDetencion = 0;
      posicionAnterior = posInicial;
      enViaje = true;
    });

    _iniciarRelojDetencion();

    suscripcionGPS = MotorGPS.obtenerFlujoUbicacion().listen((
      Position nuevaPosicion,
    ) {
      if (nuevaPosicion.accuracy > 20.0) return;
      if (posicionAnterior != null) {
        double metros = Geolocator.distanceBetween(
          posicionAnterior!.latitude,
          posicionAnterior!.longitude,
          nuevaPosicion.latitude,
          nuevaPosicion.longitude,
        );
        setState(() {
          distanciaTotalKm += (metros / 1000);
        });
      }
      posicionAnterior = nuevaPosicion;
    });
  }

  void detenerRastreo() async {
    suscripcionGPS?.cancel();
    relojDetencion?.cancel();

    // Enviar última posición al servidor
    if (posicionAnterior != null) {
      await MotorGPS.enviarUltimaPosicion(posicionAnterior!);
    }

    // Usar parámetros del servidor (o por defecto si no cargaron)
    final params = _params ?? ParametrosTopograficos.porDefecto;

    double tarifaFinal = calcularTarifa(
      distanciaKm: distanciaTotalKm,
      costoBaseKm: params.costoBaseKm,
      factorAltitud: params.factorAltitud,
      factorSuperficie: fSuperficie,
      tiempoDetencionMin: (segundosDetencion / 60),
      costoMinutoDetencion: params.costoMinutoDetencion,
    );

    final prefs = await SharedPreferences.getInstance();
    int idChofer = prefs.getInt('chofer_id') ?? 1;

    await BaseDatosLocal.instancia.insertarViaje({
      'chofer_id': idChofer,
      'distancia_km': distanciaTotalKm,
      'tiempo_detencion_min': (segundosDetencion / 60),
      'factor_altitud': params.factorAltitud,
      'factor_superficie': fSuperficie,
      'tarifa_total': tarifaFinal,
      'estado_sincronizacion': 0,
      'fecha_hora': DateTime.now().toIso8601String(),
    });

    setState(() {
      enViaje = false;
      fSuperficie = 1.0;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '✅ Viaje guardado. Total: Bs ${tarifaFinal.toStringAsFixed(2)}',
          ),
          backgroundColor: Colors.green[800],
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  @override
  void dispose() {
    suscripcionGPS?.cancel();
    relojDetencion?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final params = _params ?? ParametrosTopograficos.porDefecto;

    double tarifaEnVivo = calcularTarifa(
      distanciaKm: distanciaTotalKm,
      costoBaseKm: params.costoBaseKm,
      factorAltitud: params.factorAltitud,
      factorSuperficie: fSuperficie,
      tiempoDetencionMin: (segundosDetencion / 60),
      costoMinutoDetencion: params.costoMinutoDetencion,
    );

    return Scaffold(
      backgroundColor: enViaje ? Colors.black : Colors.grey[100],
      appBar: enViaje
          ? null
          : AppBar(
              title: const Text(
                'Radio Taxis Pulpos',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              backgroundColor: Colors.blue[800],
              foregroundColor: Colors.white,
              elevation: 0,
              actions: [
                // Indicador de parámetros cargados
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: _cargandoParams
                      ? const Center(
                          child: SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          ),
                        )
                      : Tooltip(
                          message:
                              'Cb: ${params.costoBaseKm} | FH: ${params.factorAltitud}',
                          child: const Icon(
                            Icons.cloud_done,
                            color: Colors.greenAccent,
                            size: 20,
                          ),
                        ),
                ),
              ],
            ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: enViaje ? Colors.grey[900] : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: enViaje
                        ? []
                        : [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.05),
                              blurRadius: 10,
                              offset: const Offset(0, 5),
                            ),
                          ],
                    border: enViaje
                        ? Border.all(color: Colors.greenAccent, width: 2)
                        : null,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (enViaje) ...[
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.satellite_alt,
                              color: Colors.greenAccent,
                              size: 20,
                            ),
                            SizedBox(width: 10),
                            Text(
                              'SISTEMA ACTIVO',
                              style: TextStyle(
                                color: Colors.greenAccent,
                                letterSpacing: 2,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                      ],
                      Text(
                        'TARIFA ACTUAL',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: enViaje ? Colors.grey[400] : Colors.grey,
                        ),
                      ),
                      Text(
                        'Bs ${tarifaEnVivo.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 60,
                          fontWeight: FontWeight.bold,
                          color: enViaje ? Colors.white : Colors.green[700],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 40,
                          vertical: 15,
                        ),
                        child: Divider(
                          color: enViaje ? Colors.grey[700] : Colors.grey,
                        ),
                      ),
                      Text(
                        'DISTANCIA',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: enViaje ? Colors.grey[400] : Colors.grey,
                        ),
                      ),
                      Text(
                        '${distanciaTotalKm.toStringAsFixed(3)} KM',
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.bold,
                          color: enViaje ? Colors.white : Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'TIPO DE RUTA',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: enViaje ? Colors.grey[500] : Colors.grey,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ChoiceChip(
                            label: const Text(
                              'ASFALTO',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                            selected: fSuperficie == 1.0,
                            onSelected: (_) =>
                                setState(() => fSuperficie = 1.0),
                            selectedColor: Colors.blue[800],
                            backgroundColor: enViaje
                                ? Colors.grey[800]
                                : Colors.grey[200],
                            labelStyle: TextStyle(
                              color: fSuperficie == 1.0
                                  ? Colors.white
                                  : (enViaje ? Colors.grey[300] : Colors.black),
                            ),
                          ),
                          const SizedBox(width: 15),
                          ChoiceChip(
                            label: const Text(
                              'TIERRA / COMPLEJO',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                            selected: fSuperficie != 1.0,
                            onSelected: (_) => setState(
                              () => fSuperficie = params.factorSuperficie,
                            ),
                            selectedColor: Colors.orange[800],
                            backgroundColor: enViaje
                                ? Colors.grey[800]
                                : Colors.grey[200],
                            labelStyle: TextStyle(
                              color: fSuperficie != 1.0
                                  ? Colors.white
                                  : (enViaje ? Colors.grey[300] : Colors.black),
                            ),
                          ),
                        ],
                      ),
                      // Mostrar parámetros activos (transparencia para el tribunal)
                      if (!enViaje) ...[
                        const SizedBox(height: 16),
                        Text(
                          'Cb: Bs ${params.costoBaseKm}/km · FH: ${params.factorAltitud}× · Ct: Bs ${params.costoMinutoDetencion}/min',
                          style: TextStyle(
                            fontSize: 10,
                            color: Colors.grey[400],
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 30),
              if (!enViaje) ...[
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.history),
                        label: const Text('HISTORIAL'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          foregroundColor: Colors.blue[800],
                          side: BorderSide(color: Colors.blue[800]!),
                        ),
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const PantallaHistorial(),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.cloud_upload),
                        label: const Text('SINC. NUBE'),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 15),
                          foregroundColor: Colors.green[700],
                          side: BorderSide(color: Colors.green[700]!),
                        ),
                        onPressed: sincronizarViajesPendientes,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 15),
              ],
              ElevatedButton.icon(
                icon: Icon(
                  enViaje ? Icons.stop_circle : Icons.play_circle_fill,
                  color: Colors.white,
                  size: 28,
                ),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.all(20),
                  backgroundColor: enViaje ? Colors.red[700] : Colors.blue[800],
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(15),
                  ),
                ),
                label: Text(
                  enViaje ? 'FINALIZAR VIAJE Y COBRAR' : 'INICIAR NUEVO VIAJE',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                onPressed: () {
                  if (enViaje)
                    detenerRastreo();
                  else
                    iniciarRastreo();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
