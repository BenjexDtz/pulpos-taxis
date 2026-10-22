import 'package:flutter/material.dart';
import 'base_datos.dart'; // Tu conexión a SQLite
import 'sesion.dart';
import 'tema.dart';

double totalDelDia(List<Map<String, dynamic>> viajes, DateTime dia) {
  double total = 0;
  for (final viaje in viajes) {
    final fecha = DateTime.tryParse(viaje['fecha_hora']?.toString() ?? '');
    if (fecha == null) continue;
    if (fecha.year == dia.year &&
        fecha.month == dia.month &&
        fecha.day == dia.day) {
      total += (viaje['tarifa_total'] as num? ?? 0).toDouble();
    }
  }
  return total;
}

class PantallaHistorial extends StatefulWidget {
  const PantallaHistorial({super.key});

  @override
  State<PantallaHistorial> createState() => _PantallaHistorialState();
}

class _PantallaHistorialState extends State<PantallaHistorial> {
  // Aquí guardaremos la lista de viajes que venga de SQLite
  late Future<List<Map<String, dynamic>>> _historialViajes;
  String _moneda = 'Bs';

  @override
  void initState() {
    super.initState();
    _cargarDatos();
  }

  void _cargarDatos() {
    setState(() {
      _historialViajes = _viajesDelChofer();
    });
  }

  Future<List<Map<String, dynamic>>> _viajesDelChofer() async {
    final choferId = await Sesion.choferId();
    final empresa = await Sesion.empresa();
    if (empresa != null && mounted) setState(() => _moneda = empresa.monedaSimbolo);
    if (choferId == null) return [];
    return BaseDatosLocal.instancia.viajesDeChofer(choferId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Historial de ganancias')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _historialViajes,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('No se pudo leer el historial: ${snapshot.error}'));
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.receipt_long_outlined, size: 48, color: context.textoSuave),
                  const SizedBox(height: 12),
                  Text('Todavía no hiciste ningún viaje.', style: TextStyle(fontSize: 15, color: context.textoSuave)),
                ],
              ),
            );
          }

          final viajes = snapshot.data!;
          final hoy = DateTime.now();
          final totalGanado = totalDelDia(viajes, hoy);
          final viajesHoy = viajes.where((v) {
            final f = DateTime.tryParse(v['fecha_hora']?.toString() ?? '');
            return f != null && f.year == hoy.year && f.month == hoy.month && f.day == hoy.day;
          }).length;
          final pendientes = viajes.where((v) => v['estado_sincronizacion'] == 0).length;

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: viajes.length + 1,
            separatorBuilder: (_, i) => SizedBox(height: i == 0 ? 16 : 10),
            itemBuilder: (context, index) {
              if (index == 0) {
                return Visor(
                  titulo: 'Hoy',
                  nota: pendientes > 0
                      ? Insignia('$pendientes sin enviar', color: Paleta.aviso600, icono: Icons.cloud_off)
                      : const Insignia('Todo enviado', color: Paleta.exito600, icono: Icons.cloud_done),
                  cifras: [
                    CifraVisor('Recaudado', '$_moneda ${totalGanado.toStringAsFixed(2)}'),
                    CifraVisor('Viajes', '$viajesHoy'),
                  ],
                );
              }
              final viaje = viajes[index - 1];
              final enviado = viaje['estado_sincronizacion'] != 0;
              final fechaLimpia = viaje['fecha_hora'].toString().substring(0, 16).replaceFirst('T', ' ');
              final km = (viaje['distancia_km'] as num? ?? 0).toDouble();

              return Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text('Viaje #${viaje['id']}',
                                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: context.texto)),
                                const SizedBox(width: 8),
                                enviado
                                    ? const Insignia('Enviado', color: Paleta.exito600)
                                    : const Insignia('Pendiente', color: Paleta.aviso600),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text('${km.toStringAsFixed(2)} km · $fechaLimpia',
                                style: TextStyle(fontSize: 13, color: context.textoSuave)),
                          ],
                        ),
                      ),
                      Text(
                        '$_moneda ${(viaje['tarifa_total'] as num? ?? 0).toStringAsFixed(2)}',
                        style: estiloCifra.copyWith(fontSize: 17, color: context.marcaCifra),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
