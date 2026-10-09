import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

import 'api_sync.dart';

class BaseDatosLocal {
  // Patrón Singleton: Garantiza que solo haya una conexión abierta
  static final BaseDatosLocal instancia = BaseDatosLocal._init();
  static Database? _database;

  BaseDatosLocal._init();

  // Getter para obtener la base de datos, si no existe, la crea
  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _iniciarDB('pulpos_offline.db');
    return _database!;
  }

  // Busca la ruta segura en Android/iOS y abre el archivo .db
  Future<Database> _iniciarDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 6,
      onCreate: _crearDB,
      onUpgrade: _actualizarDB, // 🔥 MANEJA TELEFONOS CON LA DB VIEJA
    );
  }

  // Aquí es donde ocurre la magia de SQL que diseñamos
  Future _crearDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE viajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chofer_id INTEGER,
        distancia_km REAL,
        tiempo_detencion_min REAL,
        factor_altitud REAL,
        factor_superficie REAL,
        tarifa_total REAL,
        estado_sincronizacion INTEGER,
        fecha_hora TEXT,
        $_columnasV3,
        uuid TEXT,
        km_asfalto REAL,
        km_tierra REAL
      )
    ''');
    await _crearTablaPuntos(db);
  }

  Future _crearTablaPuntos(Database db) => db.execute('''
      CREATE TABLE IF NOT EXISTS puntos_viaje (
        viaje_uuid TEXT NOT NULL,
        orden INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        segundos INTEGER NOT NULL,
        superficie INTEGER NOT NULL,
        PRIMARY KEY (viaje_uuid, orden)
      )
    ''');

  static const _columnasV3 = '''
        tipo_superficie TEXT,
        costo_base_km REAL,
        costo_minuto_detencion REAL,
        consumo_litros_km REAL,
        precio_combustible_bs REAL''';

  Future _actualizarDB(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute('DROP TABLE IF EXISTS viajes_offline');
      await db.execute('DROP TABLE IF EXISTS viajes');
      await _crearDB(db, newVersion);
      return;
    }
    // Sin DROP: puede haber viajes pendientes de sincronizar
    if (oldVersion < 3) {
      for (final columna in _columnasV3.split(',')) {
        await db.execute('ALTER TABLE viajes ADD COLUMN ${columna.trim()}');
      }
    }
    if (oldVersion < 4) {
      await db.execute('ALTER TABLE viajes ADD COLUMN uuid TEXT');
      for (final fila in await db.query('viajes', columns: ['id'])) {
        await db.update('viajes', {'uuid': nuevoUuid()},
            where: 'id = ?', whereArgs: [fila['id']]);
      }
    }
    // Viajes previos quedan en NULL: el servidor deduce los km por superficie
    if (oldVersion < 5) {
      await db.execute('ALTER TABLE viajes ADD COLUMN km_asfalto REAL');
      await db.execute('ALTER TABLE viajes ADD COLUMN km_tierra REAL');
    }
    if (oldVersion < 6) await _crearTablaPuntos(db);
  }

  // Viaje y ruta en una sola transacción: o se guardan los dos o ninguno
  Future<int> insertarViaje(
    Map<String, dynamic> viaje, {
    List<PuntoRuta> ruta = const [],
  }) async {
    final db = await instancia.database;
    final uuid = viaje['uuid'] ?? nuevoUuid();
    return db.transaction((txn) async {
      final id = await txn.insert('viajes', {...viaje, 'uuid': uuid});
      final lote = txn.batch();
      for (var i = 0; i < ruta.length; i++) {
        lote.insert('puntos_viaje', ruta[i].paraSqlite(uuid, i));
      }
      await lote.commit(noResult: true);
      return id;
    });
  }

  Future<List<PuntoRuta>> puntosDeViaje(String? uuid) async {
    if (uuid == null) return const [];
    final db = await instancia.database;
    final filas = await db.query(
      'puntos_viaje',
      where: 'viaje_uuid = ?',
      whereArgs: [uuid],
      orderBy: 'orden',
    );
    return filas.map(PuntoRuta.desdeSqlite).toList();
  }

  // El servidor ya tiene la ruta: se borra del teléfono para no acumular puntos
  Future<void> marcarSincronizado(Map<String, dynamic> viaje) async {
    final db = await instancia.database;
    await db.transaction((txn) async {
      await txn.update(
        'viajes',
        {'estado_sincronizacion': 1},
        where: 'id = ?',
        whereArgs: [viaje['id']],
      );
      await txn.delete(
        'puntos_viaje',
        where: 'viaje_uuid = ?',
        whereArgs: [viaje['uuid']],
      );
    });
  }

  Future<List<Map<String, dynamic>>> viajesPendientes(int choferId) async {
    final db = await instancia.database;
    return await db.query(
      'viajes',
      where: 'estado_sincronizacion = ? AND chofer_id = ?',
      whereArgs: [0, choferId],
    );
  }

  Future<List<Map<String, dynamic>>> viajesDeChofer(int choferId) async {
    final db = await instancia.database;
    return await db.query(
      'viajes',
      where: 'chofer_id = ?',
      whereArgs: [choferId],
      orderBy: 'id DESC',
    );
  }

  // Esta función saca todo lo que hay en la tabla
  Future<List<Map<String, dynamic>>> obtenerTodosLosViajes() async {
    final db = await instancia.database;
    return await db.query('viajes'); // 🔥 NOMBRE UNIFICADO
  }
}
