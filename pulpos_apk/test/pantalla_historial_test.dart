import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/base_datos.dart';
import 'package:pulpos_tarifa_core/pantalla_historial.dart';
import 'package:pulpos_tarifa_core/tema.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

final hoy = DateTime.now();
String fecha(DateTime d) => d.toIso8601String();

Map<String, Object?> viaje(String uuid, double tarifa, DateTime cuando, {int estado = 0, int demo = 0, int chofer = 7}) => {
      'uuid': uuid,
      'chofer_id': chofer,
      'distancia_km': 3.25,
      'tarifa_total': tarifa,
      'estado_sincronizacion': estado,
      'fecha_hora': fecha(cuando),
      'demostracion': demo,
    };

// SQLite real (en memoria) no avanza con el reloj falso de testWidgets
Future<void> abrir(WidgetTester tester) async {
  await tester.pumpWidget(MaterialApp(theme: temaDe(Paleta.marcaPorDefecto, Brightness.light), home: const PantallaHistorial()));
  for (var i = 0; i < 5; i++) {
    await tester.runAsync(() => Future.delayed(const Duration(milliseconds: 20)));
    await tester.pump();
  }
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    BaseDatosLocal.archivo = inMemoryDatabasePath;
  });

  setUp(() => SharedPreferences.setMockInitialValues({
        'chofer_id': 7,
        'empresa': jsonEncode({'codigo': 'sur', 'nombre': 'Taxis Sur', 'moneda_simbolo': 'S/'}),
      }));

  tearDown(() async => BaseDatosLocal.cerrar());

  testWidgets('sin viajes lo dice', (tester) async {
    await abrir(tester);
    expect(find.text('Todavía no hiciste ningún viaje.'), findsOneWidget);
  });

  testWidgets('sin sesión no lee la base y muestra la lista vacía', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await abrir(tester);
    expect(find.text('Todavía no hiciste ningún viaje.'), findsOneWidget);
  });

  testWidgets('suma lo de hoy sin la demostración, marca pendientes y usa la moneda de la empresa', (tester) async {
    await tester.runAsync(() async {
      final base = BaseDatosLocal.instancia;
      await base.insertarViaje(viaje('a', 10, hoy, estado: 1));
      await base.insertarViaje(viaje('b', 5.5, hoy));
      await base.insertarViaje(viaje('c', 99, hoy, demo: 1));
      await base.insertarViaje(viaje('d', 40, hoy.subtract(const Duration(days: 2)), estado: 1));
      await base.insertarViaje(viaje('e', 70, hoy, chofer: 9));
    });
    await abrir(tester);

    expect(find.text('HOY'), findsOneWidget);
    expect(find.text('S/ 15.50'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('2 sin enviar'), findsOneWidget);
    expect(find.text('Demo'), findsOneWidget);
    expect(find.text('Pendiente'), findsNWidgets(2));
    expect(find.text('Enviado'), findsNWidgets(2));
    expect(find.text('S/ 99.00'), findsOneWidget);
    expect(find.text('S/ 70.00'), findsNothing);
    expect(find.textContaining('3.25 km · '), findsNWidgets(4));
    final titulos = tester.widgetList<Text>(find.textContaining('Viaje #')).map((t) => t.data).toList();
    expect(titulos, ['Viaje #4', 'Viaje #3', 'Viaje #2', 'Viaje #1']);
  });

  testWidgets('con todo enviado lo indica', (tester) async {
    await tester.runAsync(() => BaseDatosLocal.instancia.insertarViaje(viaje('a', 10, hoy, estado: 1)));
    await abrir(tester);
    expect(find.text('Todo enviado'), findsOneWidget);
  });
}
