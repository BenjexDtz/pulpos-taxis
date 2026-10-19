import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_sync.dart';
import 'motor_gps.dart';
import 'calculadora.dart';
import 'base_datos.dart';
import 'pantalla_historial.dart';
import 'pantalla_login.dart';
import 'rugosidad.dart';
import 'sesion.dart';
import 'sincronizador.dart';
import 'taximetro.dart';
import 'viaje_en_curso.dart';

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
  // ── Taxímetro y ruta del viaje ─────────────────────────────────────────────
  Taximetro? _taximetro;
  ViajeEnCurso? _viaje;
  DateTime _inicioViaje = DateTime.now();
  bool enViaje = false;
  StreamSubscription<Position>? suscripcionGPS;
  Timer? _reloj;
  int get _segundosViaje => DateTime.now().difference(_inicioViaje).inSeconds;
  // Un punto que implica ir a más de 120 km/h es un salto del GPS
  static const _velocidadMaxima = 120 / 3.6;

  // ── Rugosidad del camino (acelerómetro) ────────────────────────────────────
  static const _claveReferencia = 'vibracion_referencia';
  // Bajo ~7 km/h la vibración es del motor, no del camino
  static const _velocidadMinimaVibracion = 2.0;
  final _medidor = MedidorVibracion();
  SugerenciaSuperficie _sugeridor = SugerenciaSuperficie();
  StreamSubscription<AccelerometerEvent>? _suscripcionSensor;
  Sugerencia _sugerencia = Sugerencia.ninguna;
  // Mientras el chofer responde, el viaje no se sincroniza para no perder el monto
  bool _preguntandoMonto = false;

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
    _recuperarViaje();
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
    if (enViaje || _preguntandoMonto) return;
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
  void iniciarRastreo() async {
    final posInicial = await MotorGPS.obtenerUbicacionActual();
    if (posInicial == null) return;
    final choferId = await Sesion.choferId();
    if (choferId == null) {
      if (mounted) await irAlLogin(context);
      return;
    }
    final params = _params ?? ParametrosTopograficos.porDefecto;
    final viaje = ViajeEnCurso(
      uuid: nuevoUuid(),
      choferId: choferId,
      inicio: DateTime.now(),
      parametros: params,
    );
    final inicio = PuntoRuta(
      coordenada(posInicial.latitude),
      coordenada(posInicial.longitude),
      0,
      superficie,
    );
    await viaje.guardar();
    await BaseDatosLocal.instancia.insertarPunto(viaje.uuid, 0, inicio);
    await _empezarRastreo(viaje, Taximetro(TarifaTaximetro.desde(params))..ocupar(inicio));
  }

  Future<void> _empezarRastreo(ViajeEnCurso viaje, Taximetro taximetro) async {
    MotorGPS.resetContador();
    final prefs = await SharedPreferences.getInstance();
    _sugeridor = SugerenciaSuperficie(referencia: prefs.getDouble(_claveReferencia));
    _medidor.tomar();
    _suscripcionSensor = accelerometerEventStream(
      samplingPeriod: SensorInterval.gameInterval,
    ).listen((e) => _medidor.registrar(e.x, e.y, e.z), onError: (_) {});
    setState(() {
      _sugerencia = Sugerencia.ninguna;
      _viaje = viaje;
      _taximetro = taximetro;
      _inicioViaje = viaje.inicio;
      enViaje = true;
    });
    // El importe sigue subiendo con el tiempo aunque no lleguen posiciones
    _reloj = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    suscripcionGPS = MotorGPS.obtenerFlujoUbicacion().listen(_nuevaPosicion);
  }

  void _nuevaPosicion(Position posicion) {
    final taximetro = _taximetro;
    final viaje = _viaje;
    if (taximetro == null || viaje == null || taximetro.estado != EstadoTaximetro.ocupado) return;
    if (posicion.accuracy > 20.0) return;
    final anterior = taximetro.ultimoPunto!;
    final transcurrido = DateTime.now().difference(_inicioViaje).inMilliseconds / 1000;
    final segundos = transcurrido - anterior.segundos;
    final metros =
        distanciaKm(anterior.lat, anterior.lng, posicion.latitude, posicion.longitude) * 1000;
    if (segundos > 0 && metros / segundos > _velocidadMaxima) return;

    final velocidad = max(posicion.speed, segundos > 0 ? metros / segundos : 0.0);
    final rms = _medidor.tomar();
    final vibracion = velocidad >= _velocidadMinimaVibracion ? rms : null;
    final punto = PuntoRuta(
      coordenada(posicion.latitude),
      coordenada(posicion.longitude),
      max(transcurrido.floor(), anterior.segundos),
      superficie,
      vibracion,
    );
    final orden = taximetro.ruta.length;
    final sugerencia = _sugeridor.registrar(vibracion, superficie);
    setState(() {
      taximetro.registrar(punto);
      if (sugerencia != Sugerencia.ninguna) _sugerencia = sugerencia;
    });
    BaseDatosLocal.instancia.insertarPunto(viaje.uuid, orden, punto);
  }

  void _detenerSensores() {
    suscripcionGPS?.cancel();
    _reloj?.cancel();
    _suscripcionSensor?.cancel();
    _suscripcionSensor = null;
  }

  void detenerRastreo() async {
    final taximetro = _taximetro;
    final viaje = _viaje;
    if (taximetro == null || viaje == null || taximetro.estado != EstadoTaximetro.ocupado) return;
    _detenerSensores();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_claveReferencia, _sugeridor.referencia);
    await _cobrar(viaje, taximetro, _segundosViaje);
  }

  // OCUPADO → A_PAGAR (importe congelado) → LIBRE tras el diálogo
  Future<void> _cobrar(ViajeEnCurso viaje, Taximetro taximetro, int segundosFinal) async {
    taximetro.cobrar(segundosFinal, superficie);
    final ultimo = taximetro.ultimoPunto!;
    MotorGPS.enviarUltimaPosicion(ultimo.lat, ultimo.lng);
    final idViaje = await _guardarViaje(viaje, taximetro);
    final tarifaFinal = taximetro.importe;

    setState(() {
      enViaje = false;
      superficie = Superficie.asfalto;
      _sugerencia = Sugerencia.ninguna;
      _preguntandoMonto = true;
    });

    final tradicional = await _preguntarTarifaTradicional(tarifaFinal);
    if (tradicional != null) {
      await BaseDatosLocal.instancia.guardarTarifaTradicional(idViaje, tradicional);
    }
    _preguntandoMonto = false;
    if (mounted) setState(taximetro.liberar);

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

  // Se guarda con los parámetros de cuando empezó, aunque hayan cambiado durante el viaje
  Future<int> _guardarViaje(ViajeEnCurso viaje, Taximetro taximetro) async {
    final p = viaje.parametros;
    final r = taximetro.recorrido;
    final id = await BaseDatosLocal.instancia.insertarViaje(ruta: taximetro.ruta, {
      'uuid': viaje.uuid,
      'chofer_id': viaje.choferId,
      'distancia_km': r.kmTotal,
      'km_asfalto': r.kmAsfalto,
      'km_tierra': r.kmTierra,
      'km_empedrado': r.kmEmpedrado,
      'tiempo_detencion_min': taximetro.minutosPorTiempo,
      'factor_altitud': p.factorAltitud,
      'factor_superficie': p.factorSuperficie,
      'factor_empedrado': p.factorEmpedrado,
      'tarifa_total': taximetro.importe,
      'estado_sincronizacion': 0,
      'fecha_hora': DateTime.now().toIso8601String(),
      'tipo_superficie': r.tipo,
      'costo_base_km': p.costoBaseKm,
      'costo_minuto_detencion': p.costoMinutoDetencion,
      'consumo_litros_km': p.consumoLitrosKm,
      'precio_combustible_bs': p.precioCombustibleBs,
      'bajada_bandera': p.bajadaBandera,
      'valor_salto': p.valorSalto,
      'modo_tarifa': p.modoTarifa.codigo,
      'vibracion_referencia': _sugeridor.referencia,
    });
    await ViajeEnCurso.borrar();
    return id;
  }

  // La app se cerró con un viaje abierto: se recalcula con sus puntos y el chofer decide
  Future<void> _recuperarViaje() async {
    final viaje = await ViajeEnCurso.leer();
    if (viaje == null || viaje.choferId != await Sesion.choferId()) return;
    final base = BaseDatosLocal.instancia;
    final ruta = await base.puntosDeViaje(viaje.uuid);
    if (ruta.isEmpty || await base.existeViaje(viaje.uuid)) {
      await ViajeEnCurso.borrar();
      return;
    }
    final taximetro = Taximetro.desdeRuta(TarifaTaximetro.desde(viaje.parametros), ruta);
    final moneda = (await Sesion.empresa())?.monedaSimbolo ?? 'Bs';
    if (!mounted) return;
    final hora = TimeOfDay.fromDateTime(viaje.inicio).format(context);
    final continuar = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Viaje sin terminar'),
        content: Text(
          'La app se cerró durante un viaje que empezó a las $hora. '
          'Lleva ${taximetro.recorrido.kmTotal.toStringAsFixed(2)} km y marca '
          '$moneda ${taximetro.importe.toStringAsFixed(2)}. '
          'Puedes seguir el viaje o cobrarlo tal como quedó.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('COBRAR ASÍ'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('CONTINUAR'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (continuar == true) {
      await _empezarRastreo(viaje, taximetro);
    } else {
      await _cobrar(viaje, taximetro, ruta.last.segundos);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _relojSincronizacion?.cancel();
    _detenerSensores();
    super.dispose();
  }

  // Opcional: sirve para comparar la tarifa con la negociación de palabra
  Future<double?> _preguntarTarifaTradicional(double tarifa) async {
    if (!mounted) return null;
    return showDialog<double>(
      context: context,
      barrierDismissible: false,
      builder: (_) => DialogoTarifaTradicional(tarifa: tarifa, moneda: _moneda),
    );
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

    final taximetro = _taximetro;
    final recorrido = taximetro?.recorrido ?? RecorridoPorSuperficie();
    final tarifaEnVivo = (taximetro?.centavosEn(_segundosViaje) ?? 0) / 100;
    // Sin posiciones nuevas el auto está detenido o muy lento: corre el tiempo
    final porTiempo = taximetro != null &&
        (taximetro.ultimoTramoPorTiempo ||
            _segundosViaje - taximetro.ultimoPunto!.segundos >= 10);
    final cruce = TarifaTaximetro.desde(params).velocidadCruceKmh(superficie);

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
                      if (enViaje)
                        Text(
                          porTiempo
                              ? 'COBRANDO POR TIEMPO · bajo ${cruce.toStringAsFixed(0)} km/h'
                              : 'COBRANDO POR DISTANCIA · sobre ${cruce.toStringAsFixed(0)} km/h',
                          style: TextStyle(
                            fontSize: 12,
                            letterSpacing: 1,
                            color: porTiempo ? Colors.amber : Colors.greenAccent,
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
                          'Bajada: $_moneda ${params.bajadaBandera.toStringAsFixed(2)} · '
                          'Salto: $_moneda ${params.valorSalto.toStringAsFixed(2)} · Modo ${params.modoTarifa.codigo}\n'
                          'Cb: $_moneda ${params.costoBaseKm}/km · FH: ${params.factorAltitud}× · '
                          'FR: ${params.factorSuperficie}× · FE: ${params.factorEmpedrado}× · '
                          'Ct: $_moneda ${params.costoMinutoDetencion}/min · '
                          'Cruce: ${cruce.toStringAsFixed(1)} km/h',
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

class DialogoTarifaTradicional extends StatefulWidget {
  const DialogoTarifaTradicional({
    super.key,
    required this.tarifa,
    required this.moneda,
  });

  final double tarifa;
  final String moneda;

  @override
  State<DialogoTarifaTradicional> createState() =>
      _DialogoTarifaTradicionalState();
}

class _DialogoTarifaTradicionalState extends State<DialogoTarifaTradicional> {
  final _controlador = TextEditingController();

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Total: ${widget.moneda} ${widget.tarifa.toStringAsFixed(2)}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '¿Cuánto habrías cobrado este viaje sin el taxímetro? '
            'Es opcional y solo sirve para comparar.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controlador,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              prefixText: '${widget.moneda} ',
              hintText: 'Ej. 15',
              border: const OutlineInputBorder(),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('OMITIR'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, leerMonto(_controlador.text)),
          child: const Text('GUARDAR'),
        ),
      ],
    );
  }
}
