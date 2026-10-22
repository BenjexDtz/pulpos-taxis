import 'package:flutter/material.dart';
import 'calculadora.dart';

// Misma paleta que el panel web (componentes/ui/estilos.js e index.css).
class Paleta {
  static const marcaPorDefecto = Color(0xFF465FFF);
  static const gris50 = Color(0xFFF9FAFB);
  static const gris100 = Color(0xFFF2F4F7);
  static const gris200 = Color(0xFFE4E7EC);
  static const gris300 = Color(0xFFD0D5DD);
  static const gris400 = Color(0xFF98A2B3);
  static const gris500 = Color(0xFF667085);
  static const gris700 = Color(0xFF344054);
  static const gris800 = Color(0xFF1D2939);
  static const gris900 = Color(0xFF101828);
  static const gris950 = Color(0xFF0C111D);
  static const exito = Color(0xFF12B76A);
  static const exito600 = Color(0xFF039855);
  static const error = Color(0xFFF04438);
  static const error600 = Color(0xFFD92D20);
  static const aviso = Color(0xFFF79009);
  static const aviso600 = Color(0xFFDC6803);
  static const empedrado = Color(0xFF7A5AF8);
}

// El color de la empresa (empresas.color_primario); MaterialApp se reconstruye al cambiar.
final colorMarca = ValueNotifier<Color>(Paleta.marcaPorDefecto);

Color? colorDesdeHex(String? hex) {
  final limpio = hex?.replaceFirst('#', '') ?? '';
  final valor = int.tryParse(limpio, radix: 16);
  if (limpio.length != 6 || valor == null) return null;
  return Color(0xFF000000 | valor);
}

// Equivalente a la escala brand-* del panel (color-mix con blanco o negro)
Color marcaClara(Color marca, double t) => Color.lerp(marca, Colors.white, t)!;
Color marcaOscura(Color marca, double t) => Color.lerp(marca, Colors.black, t)!;

String nombreSuperficie(Superficie s) =>
    const ['Asfalto', 'Tierra', 'Empedrado'][s.index];

// Asfalto lleva el color de la empresa, como en el panel (SUPERFICIES en utilidades.js)
Color colorSuperficie(Superficie s, Color marca) =>
    [marca, Paleta.aviso, Paleta.empedrado][s.index];

ThemeData temaDe(Color marca, Brightness brillo) {
  final oscuro = brillo == Brightness.dark;
  final borde = oscuro ? Paleta.gris800 : Paleta.gris200;
  final texto = oscuro ? Colors.white.withValues(alpha: 0.9) : Paleta.gris800;
  final suave = oscuro ? Paleta.gris400 : Paleta.gris500;
  final redondeo8 = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(8),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brillo,
    colorScheme: ColorScheme.fromSeed(seedColor: marca, brightness: brillo)
        .copyWith(
          primary: marca,
          onPrimary: Colors.white,
          error: Paleta.error,
          surface: oscuro ? Paleta.gris900 : Colors.white,
          onSurface: texto,
          outline: borde,
        ),
    scaffoldBackgroundColor: oscuro ? Paleta.gris950 : Paleta.gris50,
    dividerColor: borde,
    appBarTheme: AppBarTheme(
      backgroundColor: oscuro ? Paleta.gris900 : Colors.white,
      foregroundColor: texto,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: borde)),
      titleTextStyle: TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        color: texto,
      ),
    ),
    cardTheme: CardThemeData(
      color: oscuro ? Paleta.gris900 : Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: borde),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: TextStyle(color: suave, fontSize: 14),
      hintStyle: TextStyle(color: oscuro ? Colors.white30 : Paleta.gris400),
      prefixIconColor: suave,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: oscuro ? Paleta.gris700 : Paleta.gris300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: marcaClara(marca, 0.3), width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: marca,
        foregroundColor: Colors.white,
        shape: redondeo8,
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: oscuro ? Paleta.gris400 : Paleta.gris700,
        backgroundColor: oscuro ? Paleta.gris800 : Colors.white,
        side: BorderSide(color: oscuro ? Paleta.gris700 : Paleta.gris300),
        shape: redondeo8,
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: oscuro ? marcaClara(marca, 0.48) : marca,
        shape: redondeo8,
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: oscuro ? Paleta.gris900 : Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: marca),
  );
}

// Atajos de color según el modo claro u oscuro, como las clases dark: del panel
extension ColoresPanel on BuildContext {
  bool get oscuro => Theme.of(this).brightness == Brightness.dark;
  Color get marca => Theme.of(this).colorScheme.primary;
  // text-brand-700 / dark:text-brand-300 del visor
  Color get marcaCifra =>
      oscuro ? marcaClara(marca, 0.48) : marcaOscura(marca, 0.3);
  Color get texto =>
      oscuro ? Colors.white.withValues(alpha: 0.9) : Paleta.gris800;
  Color get textoSuave => oscuro ? Paleta.gris400 : Paleta.gris500;
  Color get borde =>
      oscuro ? Colors.white.withValues(alpha: 0.1) : Paleta.gris200;
  Color get fondoTarjeta => oscuro ? Paleta.gris900 : Colors.white;
}

const estiloCifra = TextStyle(
  fontFamily: 'monospace',
  fontWeight: FontWeight.w600,
  fontFeatures: [FontFeature.tabularFigures()],
);

class Tarjeta extends StatelessWidget {
  const Tarjeta({
    super.key,
    this.titulo,
    this.subtitulo,
    this.accion,
    required this.child,
    this.padding = const EdgeInsets.all(20),
  });

  final String? titulo;
  final String? subtitulo;
  final Widget? accion;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (titulo != null) ...[
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          titulo!,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: context.texto,
                          ),
                        ),
                        if (subtitulo != null)
                          Text(
                            subtitulo!,
                            style: TextStyle(
                              fontSize: 13,
                              color: context.textoSuave,
                            ),
                          ),
                      ],
                    ),
                  ),
                  ?accion,
                ],
              ),
              const SizedBox(height: 14),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

class Insignia extends StatelessWidget {
  const Insignia(this.texto, {super.key, required this.color, this.icono});

  final String texto;
  final Color color;
  final IconData? icono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: context.oscuro ? 0.15 : 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icono != null) ...[
            Icon(icono, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            texto,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class CifraVisor {
  const CifraVisor(this.etiqueta, this.valor, {this.detalle});
  final String etiqueta;
  final String valor;
  final String? detalle;
}

// El visor del panel (componentes/tablero/Visor.jsx): cabecera en versalitas y celdas separadas por una línea
class Visor extends StatelessWidget {
  const Visor({
    super.key,
    required this.titulo,
    this.nota,
    this.principal,
    required this.cifras,
    this.resaltado,
  });

  final String titulo;
  final Widget? nota;
  final Widget? principal;
  final List<CifraVisor> cifras;
  final Color? resaltado;

  @override
  Widget build(BuildContext context) {
    final linea = context.borde;
    return Container(
      decoration: BoxDecoration(
        color: context.fondoTarjeta,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: resaltado ?? linea,
          width: resaltado == null ? 1 : 1.5,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: linea)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    titulo.toUpperCase(),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 2.2,
                      color: context.textoSuave,
                    ),
                  ),
                ),
                ?nota,
              ],
            ),
          ),
          ?principal,
          if (cifras.isNotEmpty)
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: linea)),
              ),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < cifras.length; i++) ...[
                      if (i > 0)
                        VerticalDivider(width: 1, thickness: 1, color: linea),
                      Expanded(child: _celda(context, cifras[i])),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _celda(BuildContext context, CifraVisor c) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          c.etiqueta,
          style: TextStyle(fontSize: 12, color: context.textoSuave),
        ),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            c.valor,
            style: estiloCifra.copyWith(
              fontSize: 22,
              color: context.marcaCifra,
            ),
          ),
        ),
        if (c.detalle != null)
          Text(
            c.detalle!,
            style: TextStyle(fontSize: 11, color: context.textoSuave),
          ),
      ],
    ),
  );
}

// Marca de la cabecera del panel: cuadrado con el color de la empresa
class MarcaEmpresa extends StatelessWidget {
  const MarcaEmpresa({super.key, this.tamano = 36});
  final double tamano;

  @override
  Widget build(BuildContext context) => Container(
    width: tamano,
    height: tamano,
    decoration: BoxDecoration(
      color: context.marca,
      borderRadius: BorderRadius.circular(tamano * 0.28),
    ),
    child: Icon(Icons.local_taxi, color: Colors.white, size: tamano * 0.58),
  );
}
