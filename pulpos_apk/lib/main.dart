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
import 'tema.dart';
import 'viaje_en_curso.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  colorMarca.value = colorDesdeHex((await Sesion.empresa())?.colorPrimario) ?? Paleta.marcaPorDefecto;
  runApp(const AplicacionTaximetro());
}

class AplicacionTaximetro extends StatelessWidget {
  const AplicacionTaximetro({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Color>(
      valueListenable: colorMarca,
      builder: (_, marca, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Taxímetro',
        theme: temaDe(marca, Brightness.light),
        darkTheme: temaDe(marca, Brightness.dark),
        themeMode: ThemeMode.system,
        home: const PantallaInicio(),
      ),
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
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
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
  bool _buscandoGps = false;
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
    final marca = colorDesdeHex(empresa?.colorPrimario);
    if (marca != null) colorMarca.value = marca;
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
  void _avisarFallaGps(FallaGPS falla) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(falla.mensaje),
        backgroundColor: Paleta.aviso600,
        duration: const Duration(seconds: 6),
        action: falla == FallaGPS.sinSenal
            ? null
            : SnackBarAction(
                label: 'AJUSTES',
                textColor: Colors.white,
                onPressed: () => falla.abreAjustesApp
                    ? Geolocator.openAppSettings()
                    : Geolocator.openLocationSettings(),
              ),
      ),
    );
  }

  void iniciarRastreo() async {
    if (_buscandoGps) return;
    setState(() => _buscandoGps = true);
    final (posInicial, falla) = await MotorGPS.obtenerUbicacionActual();
    if (!mounted) return;
    setState(() => _buscandoGps = false);
    if (posInicial == null) {
      _avisarFallaGps(falla ?? FallaGPS.sinSenal);
      return;
    }
    MotorGPS.enviarUltimaPosicion(posInicial.latitude, posInicial.longitude);
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
      'factor_altitud': 1.0,
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
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Paleta.aviso.withValues(alpha: context.oscuro ? 0.12 : 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Paleta.aviso.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.vibration, color: Paleta.aviso, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  irregular
                      ? 'El camino vibra más que el asfalto. ¿Es tierra o empedrado?'
                      : 'El camino parece liso. ¿Volviste al asfalto?',
                  style: TextStyle(fontSize: 13, color: context.texto),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 8,
            children: [
              TextButton(
                onPressed: _descartarSugerencia,
                child: Text('No, seguir', style: TextStyle(color: context.textoSuave)),
              ),
              for (final s in opciones)
                FilledButton(
                  onPressed: () => _elegirSuperficie(s),
                  style: FilledButton.styleFrom(backgroundColor: colorSuperficie(s, context.marca)),
                  child: Text(nombreSuperficie(s)),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatoReloj(int segundos) {
    final m = segundos ~/ 60, s = segundos % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  Widget _selectorSuperficie() {
    return Row(
      children: [
        for (final s in Superficie.values) ...[
          if (s.index > 0) const SizedBox(width: 8),
          Expanded(child: _botonSuperficie(s)),
        ],
      ],
    );
  }

  Widget _botonSuperficie(Superficie s) {
    final elegida = superficie == s;
    final color = colorSuperficie(s, context.marca);
    return Material(
      color: elegida ? color : Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: elegida ? color : (context.oscuro ? Paleta.gris700 : Paleta.gris300)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => _elegirSuperficie(s),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            children: [
              Icon(
                const [Icons.add_road, Icons.terrain, Icons.grid_view][s.index],
                size: 20,
                color: elegida ? Colors.white : color,
              ),
              const SizedBox(height: 4),
              Text(
                nombreSuperficie(s),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: elegida ? Colors.white : context.texto,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _filaParametro(String etiqueta, String valor) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Expanded(child: Text(etiqueta, style: TextStyle(fontSize: 13, color: context.textoSuave))),
        Text(valor, style: estiloCifra.copyWith(fontSize: 13, color: context.texto)),
      ],
    ),
  );

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
    final importe = enViaje ? tarifaEnVivo : params.bajadaBandera;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            const MarcaEmpresa(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _empresa?.nombre ?? 'Taxímetro',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: context.texto),
                  ),
                  Text('Taxímetro', style: TextStyle(fontSize: 12, color: context.textoSuave)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: _cargandoParams
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Tooltip(
                    message: 'Parámetros de la central cargados',
                    child: Icon(Icons.cloud_done_outlined, color: Paleta.exito, size: 22),
                  ),
          ),
          if (!enViaje)
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'Cerrar sesión',
              onPressed: _confirmarCierreSesion,
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                children: [
                  Visor(
                    titulo: 'Taxímetro',
                    resaltado: enViaje ? context.marca : null,
                    nota: enViaje
                        ? const Insignia('Ocupado', color: Paleta.error, icono: Icons.circle)
                        : const Insignia('Libre', color: Paleta.exito, icono: Icons.circle),
                    principal: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            enViaje ? 'Importe' : 'Bajada de bandera',
                            style: TextStyle(fontSize: 13, color: context.textoSuave),
                          ),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(
                              '$_moneda ${importe.toStringAsFixed(2)}',
                              style: estiloCifra.copyWith(fontSize: 54, height: 1.15, color: context.marcaCifra),
                            ),
                          ),
                          const SizedBox(height: 6),
                          if (enViaje)
                            Insignia(
                              porTiempo
                                  ? 'Cobrando por tiempo · bajo ${cruce.toStringAsFixed(0)} km/h'
                                  : 'Cobrando por distancia · sobre ${cruce.toStringAsFixed(0)} km/h',
                              color: porTiempo ? Paleta.aviso600 : Paleta.exito600,
                              icono: porTiempo ? Icons.schedule : Icons.route,
                            )
                          else
                            Text(
                              'Salto de $_moneda ${params.valorSalto.toStringAsFixed(2)} · modo ${params.modoTarifa.codigo}',
                              style: TextStyle(fontSize: 12, color: context.textoSuave),
                            ),
                        ],
                      ),
                    ),
                    cifras: [
                      CifraVisor(
                        'Distancia',
                        '${recorrido.kmTotal.toStringAsFixed(2)} km',
                        detalle: recorrido.tipo == 'asfalto' ? null : recorrido.tipo,
                      ),
                      CifraVisor('Tiempo', enViaje ? _formatoReloj(_segundosViaje) : '00:00'),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    titulo: 'Superficie',
                    subtitulo: 'Cada tramo se cobra con el factor de su calle',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _selectorSuperficie(),
                        if (recorrido.tipo != 'asfalto') ...[
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: [
                              for (final s in Superficie.values)
                                if (recorrido.kmPor(s) > 0)
                                  Insignia(
                                    '${nombreSuperficie(s)} ${recorrido.kmPor(s).toStringAsFixed(2)} km',
                                    color: colorSuperficie(s, context.marca),
                                  ),
                            ],
                          ),
                        ],
                        if (enViaje && _sugerencia != Sugerencia.ninguna) _avisoSuperficie(),
                        if (enViaje && _sugeridor.vibracionReciente != null) ...[
                          const SizedBox(height: 10),
                          Text(
                            'Vibración del camino: '
                            '${(_sugeridor.vibracionReciente! / _sugeridor.referencia).toStringAsFixed(1)}× la del asfalto',
                            style: TextStyle(fontSize: 12, color: context.textoSuave),
                          ),
                        ],
                      ],
                    ),
                  ),
                  // Parámetros activos a la vista (transparencia para el pasajero y el tribunal)
                  if (!enViaje) ...[
                    const SizedBox(height: 16),
                    Tarjeta(
                      titulo: 'Tarifa vigente',
                      subtitulo: 'Directiva 2014/32/UE, modo ${params.modoTarifa.codigo}',
                      child: Column(
                        children: [
                          _filaParametro('Costo por km (asfalto)', '$_moneda ${params.costoVariableKm.toStringAsFixed(2)}'),
                          _filaParametro('Factor tierra · empedrado', '${params.factorSuperficie}× · ${params.factorEmpedrado}×'),
                          _filaParametro('Costo por minuto', '$_moneda ${params.costoMinutoDetencion.toStringAsFixed(2)}'),
                          _filaParametro('Velocidad de cruce', '${cruce.toStringAsFixed(1)} km/h'),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!enViaje) ...[
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.receipt_long_outlined, size: 20),
                            label: const Text('HISTORIAL'),
                            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const PantallaHistorial()),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: Icon(
                              Icons.cloud_upload_outlined,
                              size: 20,
                              color: _pendientes > 0 ? Paleta.aviso : null,
                            ),
                            label: Text(_pendientes > 0 ? 'SINC. NUBE ($_pendientes)' : 'SINC. NUBE'),
                            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                            onPressed: sincronizarViajesPendientes,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],
                  FilledButton.icon(
                    icon: _buscandoGps
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                          )
                        : Icon(enViaje ? Icons.stop_circle_outlined : Icons.play_arrow_rounded, size: 26),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      backgroundColor: enViaje ? Paleta.error : null,
                      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.5),
                    ),
                    label: Text(
                      enViaje
                          ? 'FINALIZAR VIAJE Y COBRAR'
                          : _buscandoGps
                          ? 'BUSCANDO SEÑAL GPS...'
                          : 'INICIAR NUEVO VIAJE',
                    ),
                    onPressed: _buscandoGps ? null : () {
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
          ],
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
