import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/api_sync.dart';
import 'package:pulpos_tarifa_core/base_datos.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

final base = BaseDatosLocal.instancia;

Map<String, dynamic> viaje({int chofer = 7, String? uuid, int estado = 0, double tarifa = 12.5, int demostracion = 0}) => {
      'chofer_id': chofer,
      'distancia_km': 3.2,
      'tiempo_detencion_min': 2.0,
      'tarifa_total': tarifa,
      'estado_sincronizacion': estado,
      'fecha_hora': '2026-11-17T10:00:00',
      'uuid': ?uuid,
      'demostracion': demostracion,
    };

const ruta = [
  PuntoRuta(-16.5, -68.19, 0, Superficie.asfalto),
  PuntoRuta(-16.501, -68.19, 5, Superficie.tierra, 2.5),
  PuntoRuta(-16.502, -68.19, 10, Superficie.empedrado, 3.1),
];

Future<List<String>> columnas(Database db, String tabla) async =>
    (await db.rawQuery('PRAGMA table_info($tabla)')).map((c) => c['name'] as String).toList();

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    BaseDatosLocal.archivo = inMemoryDatabasePath;
  });

  tearDown(BaseDatosLocal.cerrar);

  test('crea el esquema actual con las tablas de viajes y puntos', () async {
    final db = await base.database;
    expect(await db.getVersion(), 11);
    expect(await columnas(db, 'viajes'), containsAll(['uuid', 'km_empedrado', 'modo_tarifa', 'demostracion']));
    expect(await columnas(db, 'puntos_viaje'), containsAll(['viaje_uuid', 'orden', 'vibracion']));
  });

  test('guarda el viaje con su ruta en una transacción y la devuelve en orden', () async {
    final id = await base.insertarViaje(viaje(uuid: 'u-1'), ruta: ruta);
    expect(id, greaterThan(0));
    expect(await base.existeViaje('u-1'), isTrue);
    expect(await base.existeViaje('otro'), isFalse);
    final puntos = await base.puntosDeViaje('u-1');
    expect(puntos.map((p) => p.segundos), [0, 5, 10]);
    expect(puntos[1].superficie, Superficie.tierra);
    expect(puntos[2].vibracion, 3.1);
    expect(await base.puntosDeViaje(null), isEmpty);
  });

  test('sin uuid le asigna uno nuevo', () async {
    await base.insertarViaje(viaje());
    final filas = await base.obtenerTodosLosViajes();
    expect(filas.single['uuid'], matches(RegExp(r'^[0-9a-f-]{36}$')));
  });

  test('cada punto se guarda al llegar y un reintento lo reemplaza', () async {
    await base.insertarPunto('u-2', 0, ruta[0]);
    await base.insertarPunto('u-2', 1, ruta[1]);
    await base.insertarPunto('u-2', 1, ruta[2]);
    final puntos = await base.puntosDeViaje('u-2');
    expect(puntos, hasLength(2));
    expect(puntos[1].superficie, Superficie.empedrado);
  });

  test('pendientes por chofer, y al sincronizar se marca enviado y se borra la ruta', () async {
    final id = await base.insertarViaje(viaje(uuid: 'u-3'), ruta: ruta);
    await base.insertarViaje(viaje(uuid: 'u-4', estado: 1));
    await base.insertarViaje(viaje(uuid: 'u-5', chofer: 9));
    final pendientes = await base.viajesPendientes(7);
    expect(pendientes.map((v) => v['uuid']), ['u-3']);
    await base.marcarSincronizado({'id': id, 'uuid': 'u-3'});
    expect(await base.viajesPendientes(7), isEmpty);
    expect(await base.puntosDeViaje('u-3'), isEmpty);
  });

  test('el historial del chofer va del más nuevo al más viejo y no trae los de otros', () async {
    await base.insertarViaje(viaje(uuid: 'a'));
    await base.insertarViaje(viaje(uuid: 'b', demostracion: 1));
    await base.insertarViaje(viaje(uuid: 'c', chofer: 9));
    final historial = await base.viajesDeChofer(7);
    expect(historial.map((v) => v['uuid']), ['b', 'a']);
    expect(historial.first['demostracion'], 1);
  });

  test('el monto sin taxímetro solo se guarda mientras el viaje no se envió', () async {
    final pendiente = await base.insertarViaje(viaje(uuid: 'p'));
    final enviado = await base.insertarViaje(viaje(uuid: 'e', estado: 1));
    await base.guardarTarifaTradicional(pendiente, 15);
    await base.guardarTarifaTradicional(enviado, 15);
    final filas = {for (final v in await base.obtenerTodosLosViajes()) v['uuid']: v['tarifa_tradicional']};
    expect(filas, {'p': 15.0, 'e': null});
  });

  group('migraciones', () {
    Future<Database> abrir() => databaseFactoryFfi.openDatabase(inMemoryDatabasePath,
        options: OpenDatabaseOptions(singleInstance: false));

    test('desde la versión 3 conserva los viajes pendientes y les asigna uuid', () async {
      final db = await abrir();
      await db.execute('''CREATE TABLE viajes (id INTEGER PRIMARY KEY AUTOINCREMENT, chofer_id INTEGER, distancia_km REAL,
        tiempo_detencion_min REAL, factor_altitud REAL, factor_superficie REAL, tarifa_total REAL, estado_sincronizacion INTEGER,
        fecha_hora TEXT, tipo_superficie TEXT, costo_base_km REAL, costo_minuto_detencion REAL, consumo_litros_km REAL,
        precio_combustible_bs REAL)''');
      await db.insert('viajes', {'chofer_id': 7, 'tarifa_total': 9.5, 'estado_sincronizacion': 0});
      await base.actualizarDB(db, 3, 11);
      final fila = (await db.query('viajes')).single;
      expect(fila['tarifa_total'], 9.5);
      expect(fila['uuid'], isNotNull);
      expect(fila['demostracion'], 0);
      expect(fila['km_asfalto'], isNull);
      expect(await columnas(db, 'puntos_viaje'), contains('vibracion'));
      await db.close();
    });

    test('desde la versión 1 rehace las tablas', () async {
      final db = await abrir();
      await db.execute('CREATE TABLE viajes_offline (id INTEGER)');
      await base.actualizarDB(db, 1, 11);
      final tablas = (await db.rawQuery("SELECT name FROM sqlite_master WHERE type='table'")).map((t) => t['name']);
      expect(tablas, containsAll(['viajes', 'puntos_viaje']));
      expect(tablas, isNot(contains('viajes_offline')));
      await db.close();
    });

    test('desde la versión 7 agrega la vibración a los puntos que no la tenían', () async {
      final db = await abrir();
      await db.execute('''CREATE TABLE viajes (id INTEGER PRIMARY KEY, uuid TEXT)''');
      await db.execute('''CREATE TABLE puntos_viaje (viaje_uuid TEXT, orden INTEGER, lat REAL, lng REAL, segundos INTEGER, superficie INTEGER)''');
      await base.actualizarDB(db, 7, 11);
      expect(await columnas(db, 'puntos_viaje'), contains('vibracion'));
      expect(await columnas(db, 'viajes'), containsAll(['vibracion_referencia', 'tarifa_tradicional', 'bajada_bandera', 'demostracion']));
      await db.close();
    });
  });
}
