import 'package:flutter/material.dart';
import 'base_datos.dart'; // Tu conexión a SQLite

class PantallaHistorial extends StatefulWidget {
  const PantallaHistorial({super.key});

  @override
  State<PantallaHistorial> createState() => _PantallaHistorialState();
}

class _PantallaHistorialState extends State<PantallaHistorial> {
  // Aquí guardaremos la lista de viajes que venga de SQLite
  late Future<List<Map<String, dynamic>>> _historialViajes;

  @override
  void initState() {
    super.initState();
    _cargarDatos();
  }

  void _cargarDatos() {
    setState(() {
      _historialViajes = BaseDatosLocal.instancia.obtenerTodosLosViajes();
    });
  }

  // Función matemática rápida para sumar el total
  double _calcularTotal(List<Map<String, dynamic>> viajes) {
    double total = 0;
    for (var viaje in viajes) {
      total += viaje['tarifa_total'];
    }
    return total;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text('Historial de Ganancias'),
        backgroundColor: Colors.blue[800],
        foregroundColor: Colors.white,
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _historialViajes,
        builder: (context, snapshot) {
          // 1. Mientras está cargando
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          // 2. Si hay un error
          if (snapshot.hasError) {
            return Center(
              child: Text('Error al leer la caja negra: ${snapshot.error}'),
            );
          }

          // 3. Si la base de datos está vacía
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(
              child: Text(
                'No has realizado ninguna carrera aún.',
                style: TextStyle(fontSize: 16, color: Colors.grey),
              ),
            );
          }

          // 4. Si hay datos, los mostramos
          final viajes = snapshot.data!;
          final totalGanado = _calcularTotal(viajes);

          return Column(
            children: [
              // Panel de Total Ganado (El resumen del día)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    const Text(
                      'TOTAL RECAUDADO HOY',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      'Bs ${totalGanado.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                        color: Colors.green[700],
                      ),
                    ),
                  ],
                ),
              ),

              // Lista de viajes (El detalle)
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(10),
                  itemCount: viajes.length,
                  itemBuilder: (context, index) {
                    final viaje = viajes[index];
                    // Formateamos la fecha para que se vea bonita (cortamos los milisegundos)
                    String fechaLimpia = viaje['fecha_hora']
                        .toString()
                        .substring(0, 16)
                        .replaceFirst('T', ' ');

                    return Card(
                      elevation: 2,
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: viaje['estado_sincronizacion'] == 0
                              ? Colors.orange[100]
                              : Colors.green[100],
                          child: Icon(
                            viaje['estado_sincronizacion'] == 0
                                ? Icons.cloud_off
                                : Icons.cloud_done,
                            color: viaje['estado_sincronizacion'] == 0
                                ? Colors.orange
                                : Colors.green,
                          ),
                        ),
                        title: Text('Ticket #${viaje['id']}'),
                        subtitle: Text(
                          'Distancia: ${viaje['distancia_km']} km\nFecha: $fechaLimpia',
                        ),
                        trailing: Text(
                          'Bs ${viaje['tarifa_total'].toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
