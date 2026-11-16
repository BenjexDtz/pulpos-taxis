import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _clavePospuesto = 'bateria_aviso_pospuesto_hasta';
const esperaTrasPosponer = Duration(days: 3);

bool debeAvisarBateria({required bool excluida, DateTime? pospuestoHasta, required DateTime ahora}) =>
    !excluida && (pospuestoHasta == null || !ahora.isBefore(pospuestoHasta));

/// Pide a Android que no suspenda la app (Doze y el ahorro de batería de cada marca) durante un viaje.
class OptimizacionBateria {
  OptimizacionBateria({MethodChannel? canal, DateTime Function()? reloj})
      : _canal = canal ?? const MethodChannel('pulpos/bateria'),
        _reloj = reloj ?? DateTime.now;

  final MethodChannel _canal;
  final DateTime Function() _reloj;

  // Sin canal (pruebas, otra plataforma) se asume excluida para no molestar
  Future<bool> estaExcluida() async {
    try {
      return await _canal.invokeMethod<bool>('estaExcluida') ?? true;
    } on PlatformException {
      return true;
    } on MissingPluginException {
      return true;
    }
  }

  Future<bool> solicitarExclusion() async {
    try {
      return await _canal.invokeMethod<bool>('solicitarExclusion') ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<bool> debeAvisar() async {
    final excluida = await estaExcluida();
    if (excluida) return false;
    final prefs = await SharedPreferences.getInstance();
    final ms = prefs.getInt(_clavePospuesto);
    return debeAvisarBateria(
      excluida: excluida,
      pospuestoHasta: ms == null ? null : DateTime.fromMillisecondsSinceEpoch(ms),
      ahora: _reloj(),
    );
  }

  Future<void> posponer() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_clavePospuesto, _reloj().add(esperaTrasPosponer).millisecondsSinceEpoch);
  }
}
