import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/main.dart';

// Abre el diálogo, ejecuta `accion` y devuelve lo que respondió
Future<double?> responder(WidgetTester tester, Future<void> Function() accion) async {
  double? resultado = -1;
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => TextButton(
          onPressed: () async => resultado = await showDialog<double>(
            context: context,
            builder: (_) => const DialogoTarifaTradicional(tarifa: 12.5, moneda: 'Bs'),
          ),
          child: const Text('abrir'),
        ),
      ),
    ),
  );
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  expect(find.text('Total: Bs 12.50'), findsOneWidget);
  await accion();
  await tester.pumpAndSettle();
  return resultado;
}

void main() {
  testWidgets('GUARDAR devuelve el monto escrito, con coma decimal', (tester) async {
    final r = await responder(tester, () async {
      await tester.enterText(find.byType(TextField), '15,50');
      await tester.tap(find.text('GUARDAR'));
    });
    expect(r, 15.5);
  });

  testWidgets('OMITIR o un monto inválido no devuelven nada', (tester) async {
    expect(await responder(tester, () => tester.tap(find.text('OMITIR'))), isNull);
    final invalido = await responder(tester, () async {
      await tester.enterText(find.byType(TextField), 'diez');
      await tester.tap(find.text('GUARDAR'));
    });
    expect(invalido, isNull);
  });
}
