import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'api_sync.dart';
import 'detector_detencion.dart';
import 'motor_gps.dart';
import 'calculadora.dart';
import 'base_datos.dart';
import 'pantalla_historial.dart';
import 'pantalla_login.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'config.dart';
import 'sesion.dart';

void main() {
  runApp(const AplicacionTaximetro());
}

class AplicacionTaximetro extends StatelessWidget {
  const AplicacionTaximetro({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Taxímetro',
      theme: ThemeData(primarySwatch: Colors.blue, fontFamily: 'Roboto'),
      home: const PantallaInicio(),
    );
  }
}

class PantallaInicio extends StatelessWidget {
  const PantallaInicio({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: Sesion.tokenValido(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            backgroundColor: Colors.black,
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return snapshot.data != null
            ? const PantallaPrueba()
            : const PantallaLogin();
      },
    );
  }
}

Future<void> irAlLogin(BuildContext context) async {
  await Sesion.cerrar();
  if (!context.mounted) return;
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute(builder: (_) => const PantallaLogin()),
    (_) => false,
  );
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
  DetectorDetencion? _detector;
  double get minutosDetencion => _detector?.minutosDetenido ?? 0;
  Timer? relojDetencion;
  bool estaDetenido = false;

  // ── Parámetros topográficos (desde servidor) ───────────────────────────────
  ParametrosTopograficos? _params;
  EmpresaActual? _empresa;
  String get _moneda => _empresa?.monedaSimbolo ?? 'Bs';
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
    final empresa = await Sesion.empresa();
    if (!mounted) return;
    setState(() {
      _params = params;
      _empresa = empresa;
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

    final db = await BaseDatosLocal.instancia.database;
    final token = await Sesion.tokenValido();
    final choferId = await Sesion.choferId();
    if (token == null || choferId == null) {
      if (mounted) await irAlLogin(context);
      return;
    }
    final pendientes = await BaseDatosLocal.instancia.viajesPendientes(choferId);

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
    bool sesionRechazada = false;
    for (var viaje in pendientes) {
      try {
        final response = await http.post(
          Uri.parse('$urlServidor/api/viajes/sincronizar'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode(viajeParaServidor(viaje)),
        );
        // 200: el servidor ya tenía este viaje (reintento)
        if (response.statusCode == 201 || response.statusCode == 200) {
          await db.update(
            'viajes',
            {'estado_sincronizacion': 1},
            where: 'id = ?',
            whereArgs: [viaje['id']],
          );
          enviados++;
        } else if (response.statusCode == 401 || response.statusCode == 403) {
          sesionRechazada = true;
          break;
        }
      } catch (e) {
        debugPrint("Error de red: $e");
      }
    }

    if (mounted && sesionRechazada) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            '🔒 Sesión no válida o cuenta desactivada. Vuelve a iniciar sesión.',
          ),
          backgroundColor: Colors.red[800],
        ),
      );
      await irAlLogin(context);
      return;
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

  Future<void> _confirmarCierreSesion() async {
    final choferId = await Sesion.choferId();
    final pendientes = choferId == null
        ? 0
        : (await BaseDatosLocal.instancia.viajesPendientes(choferId)).length;
    if (!mounted) return;

    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cerrar sesión'),
        content: Text(
          pendientes == 0
              ? '¿Seguro que quieres salir?'
              : 'Tienes $pendientes viaje(s) sin sincronizar. Quedarán guardados '
                    'en el teléfono y se subirán cuando vuelvas a iniciar sesión '
                    'con tu placa. Te conviene sincronizar antes de salir.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('CANCELAR'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              pendientes == 0 ? 'SALIR' : 'SALIR DE TODOS MODOS',
              style: TextStyle(color: Colors.red[700]),
            ),
          ),
        ],
      ),
    );
    if (confirmado == true && mounted) await irAlLogin(context);
  }

  // ── Control del viaje ──────────────────────────────────────────────────────
  void _iniciarRelojDetencion() {
    relojDetencion = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (enViaje && _detector != null) {
        final detenido = _detector!.tick(DateTime.now());
        setState(() => estaDetenido = detenido);
      }
    });
  }

  void iniciarRastreo() async {
    final posInicial = await MotorGPS.obtenerUbicacionActual();
    if (posInicial == null) return;

    MotorGPS.resetContador();
    setState(() {
      distanciaTotalKm = 0.0;
      _detector = DetectorDetencion(
        inicio: DateTime.now(),
        velocidadInicial: posInicial.speed,
      );
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
        _detector?.registrarPosicion(
          DateTime.now(),
          velocidadReportada: nuevaPosicion.speed,
          metros: metros,
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
    _detector?.tick(DateTime.now());

    // Enviar última posición al servidor
    if (posicionAnterior != null) {
      await MotorGPS.enviarUltimaPosicion(posicionAnterior!);
    }

    // Usar parámetros del servidor (o por defecto si no cargaron)
    final params = _params ?? ParametrosTopograficos.porDefecto;

    double tarifaFinal = calcularTarifa(
      distanciaKm: distanciaTotalKm,
      costoBaseKm: params.costoBaseKm,
      consumoLitrosKm: params.consumoLitrosKm, // ← agregar
      precioCombustibleBs: params.precioCombustibleBs, // ← agregar
      factorAltitud: params.factorAltitud,
      factorSuperficie: fSuperficie,
      tiempoDetencionMin: minutosDetencion,
      costoMinutoDetencion: params.costoMinutoDetencion,
    );

    final idChofer = await Sesion.choferId();

    await BaseDatosLocal.instancia.insertarViaje({
      'chofer_id': idChofer,
      'distancia_km': distanciaTotalKm,
      'tiempo_detencion_min': minutosDetencion,
      'factor_altitud': params.factorAltitud,
      'factor_superficie': fSuperficie,
      'tarifa_total': tarifaFinal,
      'estado_sincronizacion': 0,
      'fecha_hora': DateTime.now().toIso8601String(),
      'tipo_superficie': fSuperficie == 1.0 ? 'asfalto' : 'tierra',
      'costo_base_km': params.costoBaseKm,
      'costo_minuto_detencion': params.costoMinutoDetencion,
      'consumo_litros_km': params.consumoLitrosKm,
      'precio_combustible_bs': params.precioCombustibleBs,
    });

    setState(() {
      enViaje = false;
      fSuperficie = 1.0;
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '✅ Viaje guardado. Total: $_moneda ${tarifaFinal.toStringAsFixed(2)}',
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
      consumoLitrosKm: params.consumoLitrosKm, // ← agregar
      precioCombustibleBs: params.precioCombustibleBs, // ← agregar
      factorAltitud: params.factorAltitud,
      factorSuperficie: fSuperficie,
      tiempoDetencionMin: minutosDetencion,
      costoMinutoDetencion: params.costoMinutoDetencion,
    );

    return Scaffold(
      backgroundColor: enViaje ? Colors.black : Colors.grey[100],
      appBar: enViaje
          ? null
          : AppBar(
              title: Text(
                _empresa?.nombre ?? 'Taxímetro',
                style: const TextStyle(fontWeight: FontWeight.bold),
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
                IconButton(
                  icon: const Icon(Icons.logout),
                  tooltip: 'Cerrar sesión',
                  onPressed: _confirmarCierreSesion,
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
                              color: Colors.black.withValues(alpha: 0.05),
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
                        '$_moneda ${tarifaEnVivo.toStringAsFixed(2)}',
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
                          'Cb: $_moneda ${params.costoBaseKm}/km · FH: ${params.factorAltitud}× · Ct: $_moneda ${params.costoMinutoDetencion}/min',
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
                  if (enViaje) {
                    detenerRastreo();
                  } else {
                    iniciarRastreo();
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
