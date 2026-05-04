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
      version: 2, // 🔥 SUBIMOS A VERSION 2 PARA FORZAR LA MIGRACION
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
        fecha_hora TEXT
      )
    ''');
  }

  // 🔥 MIGRACIÓN: Si el teléfono tiene la DB vieja (v1), la borra y recrea
  Future _actualizarDB(Database db, int oldVersion, int newVersion) async {
    await db.execute('DROP TABLE IF EXISTS viajes_offline');
    await db.execute('DROP TABLE IF EXISTS viajes');
    await _crearDB(db, newVersion);
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

  // Esta función saca todo lo que hay en la tabla
  Future<List<Map<String, dynamic>>> obtenerTodosLosViajes() async {
    final db = await instancia.database;
    return await db.query('viajes'); // 🔥 NOMBRE UNIFICADO
  }
}
