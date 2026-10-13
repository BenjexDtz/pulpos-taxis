import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_sync.dart';
import 'detector_detencion.dart';
import 'motor_gps.dart';
import 'calculadora.dart';
import 'base_datos.dart';
import 'pantalla_historial.dart';
import 'pantalla_login.dart';
import 'rugosidad.dart';
import 'sesion.dart';
import 'sincronizador.dart';

void main() {
  runApp(const AplicacionTaximetro());
}

const _estiloSuperficie = {
  Superficie.asfalto: ('Asfalto', Colors.blue),
  Superficie.tierra: ('Tierra', Colors.orange),
  Superficie.empedrado: ('Empedrado', Colors.deepPurple),
};

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

class _PantallaPruebaState extends State<PantallaPrueba>
    with WidgetsBindingObserver {
  // ── GPS y métricas del viaje ───────────────────────────────────────────────
  RecorridoPorSuperficie recorrido = RecorridoPorSuperficie();
  List<PuntoRuta> _ruta = [];
  DateTime _inicioViaje = DateTime.now();
  Position? posicionAnterior;
  bool enViaje = false;
  StreamSubscription<Position>? suscripcionGPS;
  DetectorDetencion? _detector;
  double get minutosDetencion => _detector?.minutosDetenido ?? 0;
  Timer? relojDetencion;
  bool estaDetenido = false;

  // ── Rugosidad del camino (acelerómetro) ────────────────────────────────────
  static const _claveReferencia = 'vibracion_referencia';
  // Bajo ~7 km/h la vibración es del motor, no del camino
  static const _velocidadMinimaVibracion = 2.0;
  final _medidor = MedidorVibracion();
  SugerenciaSuperficie _sugeridor = SugerenciaSuperficie();
  StreamSubscription<AccelerometerEvent>? _suscripcionSensor;
  Sugerencia _sugerencia = Sugerencia.ninguna;
  DateTime _ultimoPunto = DateTime.now();

  // ── Parámetros topográficos (desde servidor) ───────────────────────────────
  ParametrosTopograficos? _params;
  EmpresaActual? _empresa;
  String get _moneda => _empresa?.monedaSimbolo ?? 'Bs';
  bool _cargandoParams = true;

  Superficie superficie = Superficie.asfalto;

  final _sincronizador = Sincronizador.local();
  Timer? _relojSincronizacion;
  int _pendientes = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cargarParametros();
    _sincronizarEnSegundoPlano();
    _relojSincronizacion = Timer.periodic(
      const Duration(minutes: 2),
      (_) => _sincronizarEnSegundoPlano(),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado == AppLifecycleState.resumed) _sincronizarEnSegundoPlano();
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
  Future<void> _actualizarPendientes() async {
    final choferId = await Sesion.choferId();
    if (choferId == null) return;
    final n = (await BaseDatosLocal.instancia.viajesPendientes(choferId)).length;
    if (mounted) setState(() => _pendientes = n);
  }

  // Al terminar un viaje, al abrir la app y cada 2 minutos; sin red no avisa nada
  Future<void> _sincronizarEnSegundoPlano() async {
    if (enViaje) return;
    final token = await Sesion.tokenValido();
    final choferId = await Sesion.choferId();
    if (token == null || choferId == null) return;
    final r = await _sincronizador.ejecutar(token: token, choferId: choferId);
    await _actualizarPendientes();
    if (r == null || !mounted) return;
    if (r.sesionRechazada) {
      await _sesionRechazada();
      return;
    }
    if (r.enviados > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('☁️ ${r.enviados} viaje(s) enviados a la central.'),
          backgroundColor: Colors.green[700],
        ),
      );
    }
  }

  Future<void> sincronizarViajesPendientes() async {
    final mensajero = ScaffoldMessenger.of(context);
    final token = await Sesion.tokenValido();
    final choferId = await Sesion.choferId();
    if (token == null || choferId == null) {
      if (mounted) await irAlLogin(context);
      return;
    }
    mensajero.showSnackBar(
      const SnackBar(content: Text('🔄 Sincronizando viajes con la central...')),
    );
    final r = await _sincronizador.ejecutar(token: token, choferId: choferId);
    await _actualizarPendientes();
    if (!mounted) return;
    mensajero.hideCurrentSnackBar();
    if (r == null) {
      mensajero.showSnackBar(
        const SnackBar(content: Text('⏳ Ya se están enviando los viajes.')),
      );
    } else if (r.sesionRechazada) {
      await _sesionRechazada();
    } else if (r.pendientes == 0) {
      mensajero.showSnackBar(
        SnackBar(
          content: Text(
            r.enviados == 0
                ? '✅ Todo al día. No hay viajes pendientes.'
                : '📡 Éxito: ${r.enviados} viaje(s) subidos a gerencia.',
          ),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      mensajero.showSnackBar(
        SnackBar(
          content: Text(
            '📶 Sin conexión con la central: ${r.pendientes} viaje(s) quedan '
            'guardados y se enviarán solos al recuperar la señal.',
          ),
          backgroundColor: Colors.orange[800],
        ),
      );
    }
  }

  Future<void> _sesionRechazada() async {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text(
          '🔒 Sesión no válida o cuenta desactivada. Vuelve a iniciar sesión.',
        ),
        backgroundColor: Colors.red[800],
      ),
    );
    await irAlLogin(context);
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
    final prefs = await SharedPreferences.getInstance();
    _sugeridor = SugerenciaSuperficie(referencia: prefs.getDouble(_claveReferencia));
    _medidor.tomar();
    _suscripcionSensor = accelerometerEventStream(
      samplingPeriod: SensorInterval.gameInterval,
    ).listen((e) => _medidor.registrar(e.x, e.y, e.z), onError: (_) {});
    setState(() {
      _sugerencia = Sugerencia.ninguna;
      _ultimoPunto = DateTime.now();
      recorrido = RecorridoPorSuperficie();
      _inicioViaje = DateTime.now();
      _ruta = [
        PuntoRuta(posInicial.latitude, posInicial.longitude, 0, superficie),
      ];
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
        final ahora = DateTime.now();
        _detector?.registrarPosicion(
          ahora,
          velocidadReportada: nuevaPosicion.speed,
          metros: metros,
        );
        final segundos = ahora.difference(_ultimoPunto).inMilliseconds / 1000;
        _ultimoPunto = ahora;
        final velocidad = max(nuevaPosicion.speed, segundos > 0 ? metros / segundos : 0.0);
        final rms = _medidor.tomar();
        final vibracion = velocidad >= _velocidadMinimaVibracion ? rms : null;
        _ruta.add(
          PuntoRuta(
            nuevaPosicion.latitude,
            nuevaPosicion.longitude,
            ahora.difference(_inicioViaje).inSeconds,
            superficie,
            vibracion,
          ),
        );
        final sugerencia = _sugeridor.registrar(vibracion, superficie);
        setState(() {
          recorrido.sumar(metros / 1000, superficie);
          if (sugerencia != Sugerencia.ninguna) _sugerencia = sugerencia;
        });
      }
      posicionAnterior = nuevaPosicion;
    });
  }

  void detenerRastreo() async {
    suscripcionGPS?.cancel();
    relojDetencion?.cancel();
    _suscripcionSensor?.cancel();
    _suscripcionSensor = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_claveReferencia, _sugeridor.referencia);
    _detector?.tick(DateTime.now());

    // Enviar última posición al servidor
    if (posicionAnterior != null) {
      await MotorGPS.enviarUltimaPosicion(posicionAnterior!);
    }

    // Usar parámetros del servidor (o por defecto si no cargaron)
    final params = _params ?? ParametrosTopograficos.porDefecto;

    final tarifaFinal = recorrido.tarifa(params, minutosDetencion);

    final idChofer = await Sesion.choferId();

    await BaseDatosLocal.instancia.insertarViaje(ruta: _ruta, {
      'chofer_id': idChofer,
      'distancia_km': recorrido.kmTotal,
      'km_asfalto': recorrido.kmAsfalto,
      'km_tierra': recorrido.kmTierra,
      'km_empedrado': recorrido.kmEmpedrado,
      'tiempo_detencion_min': minutosDetencion,
      'factor_altitud': params.factorAltitud,
      'factor_superficie': params.factorSuperficie,
      'factor_empedrado': params.factorEmpedrado,
      'tarifa_total': tarifaFinal,
      'estado_sincronizacion': 0,
      'fecha_hora': DateTime.now().toIso8601String(),
      'tipo_superficie': recorrido.tipo,
      'costo_base_km': params.costoBaseKm,
      'costo_minuto_detencion': params.costoMinutoDetencion,
      'consumo_litros_km': params.consumoLitrosKm,
      'precio_combustible_bs': params.precioCombustibleBs,
      'vibracion_referencia': _sugeridor.referencia,
    });
    _ruta = [];

    setState(() {
      enViaje = false;
      superficie = Superficie.asfalto;
      _sugerencia = Sugerencia.ninguna;
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
    await _actualizarPendientes();
    _sincronizarEnSegundoPlano();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _relojSincronizacion?.cancel();
    suscripcionGPS?.cancel();
    relojDetencion?.cancel();
    _suscripcionSensor?.cancel();
    super.dispose();
  }

  void _elegirSuperficie(Superficie s) => setState(() {
    superficie = s;
    _sugerencia = Sugerencia.ninguna;
  });

  void _descartarSugerencia() {
    _sugeridor.descartar();
    setState(() => _sugerencia = Sugerencia.ninguna);
  }

  Widget _avisoSuperficie() {
    final irregular = _sugerencia == Sugerencia.caminoIrregular;
    final opciones = irregular
        ? [Superficie.tierra, Superficie.empedrado]
        : [Superficie.asfalto];
    return Container(
      margin: const EdgeInsets.only(top: 14, left: 12, right: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.vibration, color: Colors.amber),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  irregular
                      ? 'El camino vibra más que el asfalto. ¿Es tierra o empedrado?'
                      : 'El camino parece liso. ¿Volviste al asfalto?',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              for (final s in opciones)
                FilledButton(
                  onPressed: () => _elegirSuperficie(s),
                  style: FilledButton.styleFrom(
                    backgroundColor: _estiloSuperficie[s]!.$2[800],
                  ),
                  child: Text(_estiloSuperficie[s]!.$1.toUpperCase()),
                ),
              TextButton(
                onPressed: _descartarSugerencia,
                child: const Text(
                  'NO, SEGUIR',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final params = _params ?? ParametrosTopograficos.porDefecto;

    final tarifaEnVivo = recorrido.tarifa(params, minutosDetencion);

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
                        '${recorrido.kmTotal.toStringAsFixed(3)} KM',
                        style: TextStyle(
                          fontSize: 36,
                          fontWeight: FontWeight.bold,
                          color: enViaje ? Colors.white : Colors.black87,
                        ),
                      ),
                      if (recorrido.tipo != 'asfalto')
                        Text(
                          [
                            for (final s in Superficie.values)
                              if (recorrido.kmPor(s) > 0)
                                '${_estiloSuperficie[s]!.$1} '
                                    '${recorrido.kmPor(s).toStringAsFixed(2)} km',
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 13,
                            color: enViaje ? Colors.grey[400] : Colors.grey[600],
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
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 10,
                        runSpacing: 8,
                        children: [
                          for (final s in Superficie.values)
                            ChoiceChip(
                              label: Text(
                                _estiloSuperficie[s]!.$1.toUpperCase(),
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              selected: superficie == s,
                              onSelected: (_) => _elegirSuperficie(s),
                              selectedColor: _estiloSuperficie[s]!.$2[800],
                              backgroundColor: enViaje
                                  ? Colors.grey[800]
                                  : Colors.grey[200],
                              labelStyle: TextStyle(
                                color: superficie == s
                                    ? Colors.white
                                    : (enViaje ? Colors.grey[300] : Colors.black),
                              ),
                            ),
                        ],
                      ),
                      if (enViaje && _sugerencia != Sugerencia.ninguna)
                        _avisoSuperficie(),
                      if (enViaje && _sugeridor.vibracionReciente != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          'Vibración del camino: '
                          '${(_sugeridor.vibracionReciente! / _sugeridor.referencia).toStringAsFixed(1)}× la del asfalto',
                          style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                        ),
                      ],
                      // Mostrar parámetros activos (transparencia para el tribunal)
                      if (!enViaje) ...[
                        const SizedBox(height: 16),
                        Text(
                          'Cb: $_moneda ${params.costoBaseKm}/km · FH: ${params.factorAltitud}× · '
                          'FR: ${params.factorSuperficie}× · FE: ${params.factorEmpedrado}× · '
                          'Ct: $_moneda ${params.costoMinutoDetencion}/min',
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
                        label: Text(
                          _pendientes > 0
                              ? 'SINC. NUBE ($_pendientes)'
                              : 'SINC. NUBE',
                        ),
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
