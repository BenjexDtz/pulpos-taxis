import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pulpos_tarifa_core/pantalla_login.dart';
import 'package:pulpos_tarifa_core/sesion.dart';
import 'package:pulpos_tarifa_core/tema.dart';
import 'package:shared_preferences/shared_preferences.dart';

final empresa = find.widgetWithText(TextField, 'Ej. pulpos');
final placa = find.widgetWithText(TextField, 'Ej. 2456ZBK');
final clave = find.byWidgetPredicate((w) => w is TextField && w.obscureText);
final boton = find.widgetWithText(FilledButton, 'Iniciar sesión');

Future<void> abrir(WidgetTester tester) async {
  await tester.pumpWidget(MaterialApp(
    theme: temaDe(Paleta.marcaPorDefecto, Brightness.light),
    home: const PantallaLogin(),
  ));
  await tester.pump();
}

Future<void> llenar(WidgetTester tester, String e, String p, String c) async {
  await tester.enterText(empresa, e);
  await tester.enterText(placa, p);
  await tester.enterText(clave, c);
}

// http.post del login usa el cliente de la zona; así no sale a la red
Future<void> ingresar(WidgetTester tester, MockClient cliente) => http.runWithClient(() async {
      await tester.ensureVisible(boton);
      await tester.tap(boton);
      await tester.pump();
      await tester.pump();
    }, () => cliente);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('con campos vacíos no llama al servidor', (tester) async {
    var llamadas = 0;
    await abrir(tester);
    await ingresar(tester, MockClient((_) async { llamadas++; return http.Response('{}', 200); }));
    expect(find.text('Por favor, llena todos los campos.'), findsOneWidget);
    expect(llamadas, 0);
  });

  testWidgets('una placa mal escrita se rechaza antes de enviar', (tester) async {
    var llamadas = 0;
    await abrir(tester);
    await llenar(tester, 'pulpos', '12AB', 'clave12345');
    await ingresar(tester, MockClient((_) async { llamadas++; return http.Response('{}', 200); }));
    expect(find.text('La placa debe tener 4 números y 3 letras, por ejemplo 2456ZBK.'), findsOneWidget);
    expect(llamadas, 0);
  });

  testWidgets('un código de empresa con símbolos se rechaza', (tester) async {
    await abrir(tester);
    await llenar(tester, 'pul pos!', '2456ZBK', 'clave12345');
    await ingresar(tester, MockClient((_) async => http.Response('{}', 200)));
    expect(find.text('El código de empresa solo admite letras, números y guiones.'), findsOneWidget);
  });

  testWidgets('muestra el error que responde el servidor', (tester) async {
    late http.Request enviado;
    await abrir(tester);
    await llenar(tester, ' Pulpos ', '1234-kkk', 'clave12345 ');
    await ingresar(tester, MockClient((r) async {
      enviado = r;
      return http.Response(jsonEncode({'error': 'Credenciales incorrectas'}), 401);
    }));
    expect(find.text('Credenciales incorrectas'), findsOneWidget);
    expect(enviado.url.path, '/api/login');
    expect(jsonDecode(enviado.body), {'empresa': 'pulpos', 'placa_vehiculo': '1234KKK', 'password': 'clave12345'});
    expect(await Sesion.choferId(), isNull);
  });

  testWidgets('sin red avisa que no hay conexión con la central', (tester) async {
    await abrir(tester);
    await llenar(tester, 'pulpos', '1234KKK', 'clave12345');
    await ingresar(tester, MockClient((_) async => throw http.ClientException('sin red')));
    expect(find.textContaining('Sin conexión con la central'), findsOneWidget);
    expect(tester.widget<FilledButton>(boton).onPressed, isNotNull);
  });

  testWidgets('al entrar guarda la empresa, aplica su color y abre el taxímetro', (tester) async {
    await abrir(tester);
    await llenar(tester, 'pulpos', '1234KKK', 'clave12345');
    final respuesta = {
      'token': 'jwt',
      'chofer': {'id': 7, 'nombre_completo': 'Juan Pérez'},
      'empresa': {'codigo': 'pulpos', 'nombre': 'Radio Taxi Pulpos', 'moneda_simbolo': 'Bs', 'color_primario': '#10b981'},
    };
    await ingresar(tester, MockClient((_) async => http.Response(jsonEncode(respuesta), 200)));
    for (var i = 0; i < 50 && find.text('INICIAR NUEVO VIAJE').evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 10));
    }
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('INICIAR NUEVO VIAJE'), findsOneWidget);
    expect(find.text('Portal de conductores'), findsNothing);
    expect(await Sesion.ultimoCodigoEmpresa(), 'pulpos');
    expect(colorMarca.value, const Color(0xFF10B981));
    colorMarca.value = Paleta.marcaPorDefecto;
  });

  testWidgets('recuerda el último código de empresa', (tester) async {
    SharedPreferences.setMockInitialValues({'ultimo_codigo_empresa': 'illimani'});
    await abrir(tester);
    expect(tester.widget<TextField>(empresa).controller!.text, 'illimani');
  });
}
