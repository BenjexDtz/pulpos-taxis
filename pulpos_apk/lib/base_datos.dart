import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

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
      version: 3, // v3: guarda todos los parámetros aplicados (auditoría)
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
        $_columnasV3
      )
    ''');
  }

  // Columnas añadidas en v3: parámetros exactos con los que se cobró el viaje
  static const _columnasV3 = '''
        tipo_superficie TEXT,
        costo_base_km REAL,
        costo_minuto_detencion REAL,
        consumo_litros_km REAL,
        precio_combustible_bs REAL''';

  // 🔥 MIGRACIONES
  Future _actualizarDB(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      // v1 tenía otro esquema: se recrea (ya crea las columnas v3)
      await db.execute('DROP TABLE IF EXISTS viajes_offline');
      await db.execute('DROP TABLE IF EXISTS viajes');
      await _crearDB(db, newVersion);
      return;
    }
    if (oldVersion < 3) {
      // v2 → v3: se AÑADEN columnas, sin borrar viajes pendientes de sincronizar.
      // Los viajes viejos quedan con NULL y el servidor usa sus valores por defecto.
      for (final columna in _columnasV3.split(',')) {
        await db.execute('ALTER TABLE viajes ADD COLUMN ${columna.trim()}');
      }
    }
  }

  // Función para guardar un nuevo viaje en la "caja negra"
  Future<int> insertarViaje(Map<String, dynamic> viaje) async {
    final db = await instancia.database;

    int idGenerado = await db.insert(
      'viajes', // 🔥 NOMBRE UNIFICADO
      viaje,
    );

    return idGenerado;
  }

  // Viajes de ESE chofer aún no subidos. El servidor asigna cada viaje al chofer
  // del token, así que nunca se deben enviar los de otro chofer del mismo teléfono.
  Future<List<Map<String, dynamic>>> viajesPendientes(int choferId) async {
    final db = await instancia.database;
    return await db.query(
      'viajes',
      where: 'estado_sincronizacion = ? AND chofer_id = ?',
      whereArgs: [0, choferId],
    );
  }

  // Esta función saca todo lo que hay en la tabla
  Future<List<Map<String, dynamic>>> obtenerTodosLosViajes() async {
    final db = await instancia.database;
    return await db.query('viajes'); // 🔥 NOMBRE UNIFICADO
  }
}
