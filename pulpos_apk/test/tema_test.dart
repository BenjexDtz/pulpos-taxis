import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:pulpos_tarifa_core/tema.dart';

Widget conTema(Widget hijo, {Brightness brillo = Brightness.light, Color marca = const Color(0xFF10B981)}) =>
    MaterialApp(theme: temaDe(marca, brillo), home: Scaffold(body: hijo));

void main() {
  group('colores', () {
    test('colorDesdeHex acepta #RRGGBB y rechaza lo demás', () {
      expect(colorDesdeHex('#10b981'), const Color(0xFF10B981));
      expect(colorDesdeHex('10B981'), const Color(0xFF10B981));
      expect(colorDesdeHex('#fff'), isNull);
      expect(colorDesdeHex('#zzzzzz'), isNull);
      expect(colorDesdeHex(null), isNull);
    });

    test('marcaClara y marcaOscura mezclan con blanco y negro', () {
      const marca = Color(0xFF000000);
      expect(marcaClara(marca, 1), Colors.white);
      expect(marcaClara(marca, 0), marca);
      expect(marcaOscura(Colors.white, 1), Colors.black);
    });

    test('el asfalto lleva el color de la empresa y cada superficie su nombre', () {
      const marca = Color(0xFF123456);
      expect(colorSuperficie(Superficie.asfalto, marca), marca);
      expect(colorSuperficie(Superficie.tierra, marca), Paleta.aviso);
      expect(colorSuperficie(Superficie.empedrado, marca), Paleta.empedrado);
      expect(Superficie.values.map(nombreSuperficie), ['Asfalto', 'Tierra', 'Empedrado']);
    });

    test('temaDe usa el color de la empresa y el fondo según el modo', () {
      const marca = Color(0xFF10B981);
      final claro = temaDe(marca, Brightness.light);
      final oscuro = temaDe(marca, Brightness.dark);
      expect(claro.colorScheme.primary, marca);
      expect(claro.scaffoldBackgroundColor, Paleta.gris50);
      expect(oscuro.scaffoldBackgroundColor, Paleta.gris950);
      expect(oscuro.brightness, Brightness.dark);
      expect(claro.filledButtonTheme.style!.backgroundColor!.resolve({}), marca);
    });
  });

  group('widgets del tema', () {
    testWidgets('Tarjeta muestra título, subtítulo y acción solo si los recibe', (tester) async {
      await tester.pumpWidget(conTema(Tarjeta(
        titulo: 'Viaje',
        subtitulo: 'En curso',
        accion: const Icon(Icons.close),
        child: const Text('cuerpo'),
      )));
      expect(find.text('Viaje'), findsOneWidget);
      expect(find.text('En curso'), findsOneWidget);
      expect(find.byIcon(Icons.close), findsOneWidget);
      await tester.pumpWidget(conTema(const Tarjeta(child: Text('solo cuerpo'))));
      expect(find.text('solo cuerpo'), findsOneWidget);
      expect(find.text('Viaje'), findsNothing);
    });

    testWidgets('Insignia pinta el texto y el ícono con su color', (tester) async {
      await tester.pumpWidget(conTema(const Insignia('Enviado', color: Paleta.exito600, icono: Icons.cloud_done)));
      expect(tester.widget<Text>(find.text('Enviado')).style!.color, Paleta.exito600);
      expect(tester.widget<Icon>(find.byIcon(Icons.cloud_done)).color, Paleta.exito600);
    });

    testWidgets('Visor pone el título en mayúsculas, separa las cifras y muestra el detalle', (tester) async {
      await tester.pumpWidget(conTema(
        Visor(
          titulo: 'Hoy',
          nota: const Text('nota'),
          principal: const Text('Bs 12.50'),
          resaltado: Colors.red,
          cifras: const [CifraVisor('Recaudado', 'Bs 30.00', detalle: '2 viajes'), CifraVisor('Km', '4.2')],
        ),
        brillo: Brightness.dark,
      ));
      expect(find.text('HOY'), findsOneWidget);
      expect(find.text('nota'), findsOneWidget);
      expect(find.text('Bs 12.50'), findsOneWidget);
      expect(find.text('2 viajes'), findsOneWidget);
      expect(find.byType(VerticalDivider), findsOneWidget);
      final caja = tester.widget<Container>(find.byType(Container).first).decoration as BoxDecoration;
      expect((caja.border as Border).top.color, Colors.red);
    });

    testWidgets('Visor sin cifras no dibuja la fila de celdas', (tester) async {
      await tester.pumpWidget(conTema(const Visor(titulo: 'Libre', cifras: [])));
      expect(find.byType(VerticalDivider), findsNothing);
      expect(find.byType(IntrinsicHeight), findsNothing);
    });

    testWidgets('MarcaEmpresa usa el color de la empresa y AnchoLegible limita el ancho', (tester) async {
      const marca = Color(0xFF123456);
      await tester.pumpWidget(conTema(const AnchoLegible(child: MarcaEmpresa(tamano: 50)), marca: marca));
      final caja = tester.widget<Container>(find.byType(Container)).decoration as BoxDecoration;
      expect(caja.color, marca);
      expect(tester.getSize(find.byType(Container)), const Size(50, 50));
      final limite = tester.widget<ConstrainedBox>(
        find.descendant(of: find.byType(AnchoLegible), matching: find.byType(ConstrainedBox)).first);
      expect(limite.constraints.maxWidth, 720);
    });

    testWidgets('los atajos de color cambian entre modo claro y oscuro', (tester) async {
      late BuildContext claro, oscuro;
      await tester.pumpWidget(conTema(Builder(builder: (c) { claro = c; return const SizedBox(); })));
      expect(claro.oscuro, isFalse);
      expect(claro.texto, Paleta.gris800);
      expect(claro.fondoTarjeta, Colors.white);
      expect(claro.borde, Paleta.gris200);
      expect(claro.marcaCifra, marcaOscura(claro.marca, 0.3));
      await tester.pumpWidget(conTema(Builder(builder: (c) { oscuro = c; return const SizedBox(); }), brillo: Brightness.dark));
      // MaterialApp anima el cambio de tema
      await tester.pumpAndSettle();
      expect(oscuro.oscuro, isTrue);
      expect(oscuro.textoSuave, Paleta.gris400);
      expect(oscuro.fondoTarjeta, Paleta.gris900);
      expect(oscuro.marcaCifra, marcaClara(oscuro.marca, 0.48));
    });
  });
}
