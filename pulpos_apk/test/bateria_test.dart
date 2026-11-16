import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/bateria.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final ahora = DateTime(2026, 11, 16, 9);
  const canal = MethodChannel('pulpos/bateria-test');
  final mensajero = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  void responder(Object? Function(MethodCall) f) =>
      mensajero.setMockMethodCallHandler(canal, (llamada) async => f(llamada));

  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => mensajero.setMockMethodCallHandler(canal, null));

  group('debeAvisarBateria', () {
    test('avisa si la app sigue optimizada y nunca se pospuso', () {
      expect(debeAvisarBateria(excluida: false, ahora: ahora), isTrue);
    });

    test('no avisa si ya está excluida', () {
      expect(debeAvisarBateria(excluida: true, ahora: ahora), isFalse);
    });

    test('respeta el plazo pospuesto y vuelve a avisar al vencer', () {
      final hasta = ahora.add(const Duration(hours: 1));
      expect(debeAvisarBateria(excluida: false, pospuestoHasta: hasta, ahora: ahora), isFalse);
      expect(debeAvisarBateria(excluida: false, pospuestoHasta: hasta, ahora: hasta), isTrue);
    });
  });

  group('OptimizacionBateria', () {
    test('pregunta al canal nativo si la app está excluida', () async {
      responder((l) => l.method == 'estaExcluida' ? false : null);
      final b = OptimizacionBateria(canal: canal, reloj: () => ahora);
      expect(await b.estaExcluida(), isFalse);
      expect(await b.debeAvisar(), isTrue);
    });

    test('posponer calla el aviso durante 3 días', () async {
      responder((l) => false);
      var reloj = ahora;
      final b = OptimizacionBateria(canal: canal, reloj: () => reloj);
      await b.posponer();
      reloj = ahora.add(const Duration(days: 2, hours: 23));
      expect(await b.debeAvisar(), isFalse);
      reloj = ahora.add(esperaTrasPosponer);
      expect(await b.debeAvisar(), isTrue);
    });

    test('sin implementación nativa no avisa ni falla', () async {
      final b = OptimizacionBateria(canal: canal, reloj: () => ahora);
      expect(await b.estaExcluida(), isTrue);
      expect(await b.debeAvisar(), isFalse);
      expect(await b.solicitarExclusion(), isFalse);
    });

    test('un error de la plataforma no rompe la app', () async {
      responder((l) => throw PlatformException(code: 'x'));
      final b = OptimizacionBateria(canal: canal, reloj: () => ahora);
      expect(await b.estaExcluida(), isTrue);
      expect(await b.solicitarExclusion(), isFalse);
    });

    test('solicitarExclusion devuelve lo que informa Android', () async {
      responder((l) => l.method == 'solicitarExclusion' ? true : null);
      final b = OptimizacionBateria(canal: canal, reloj: () => ahora);
      expect(await b.solicitarExclusion(), isTrue);
    });
  });
}
