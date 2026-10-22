import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'sesion.dart';
import 'tema.dart';
import 'main.dart'; // Para poder saltar a tu taxímetro
import 'config.dart';

class PantallaLogin extends StatefulWidget {
  const PantallaLogin({super.key});

  @override
  State<PantallaLogin> createState() => _PantallaLoginState();
}

class _PantallaLoginState extends State<PantallaLogin> {
  final TextEditingController _empresaController = TextEditingController();
  final TextEditingController _placaController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    Sesion.ultimoCodigoEmpresa().then((codigo) {
      if (codigo != null && mounted && _empresaController.text.isEmpty) {
        _empresaController.text = codigo;
      }
    });
  }

  Future<void> _iniciarSesion() async {
    // Evitar que el usuario mande campos vacíos
    if (_empresaController.text.trim().isEmpty ||
        _placaController.text.isEmpty ||
        _passwordController.text.isEmpty) {
      _mostrarError('Por favor, llena todos los campos.');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final response = await http.post(
        Uri.parse('$urlServidor/api/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'empresa': _empresaController.text.trim().toLowerCase(),
          'placa_vehiculo': _placaController.text.trim(),
          'password': _passwordController.text.trim(),
        }),
      );

      if (response.statusCode == 200) {
        // 1. Extraemos el pase de entrada (Token) y los datos
        final data = jsonDecode(response.body);
        final String token = data['token'];
        final int choferId = data['chofer']['id'];
        final String nombreChofer = data['chofer']['nombre_completo'];

        final empresa = EmpresaActual.fromJson(data['empresa']);
        await Sesion.guardar(
          token: token,
          choferId: choferId,
          nombre: nombreChofer,
          empresa: empresa,
        );
        colorMarca.value = colorDesdeHex(empresa.colorPrimario) ?? Paleta.marcaPorDefecto;

        // 3. ¡Abrimos la puerta! Saltamos al taxímetro y destruimos la pantalla de login atrás
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => const PantallaPrueba()),
          );
        }
      } else {
        // Credenciales incorrectas
        final errorData = jsonDecode(response.body);
        _mostrarError(errorData['error'] ?? 'Error de autenticación');
      }
    } catch (e) {
      _mostrarError('Sin conexión con la central. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _mostrarError(String mensaje) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(mensaje), backgroundColor: Paleta.error600),
      );
    }
  }

  Widget _campo(String etiqueta, TextEditingController controlador, IconData icono,
      {String? pista, bool oculto = false, bool sinCorrector = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(etiqueta, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: context.texto)),
        const SizedBox(height: 6),
        TextField(
          controller: controlador,
          obscureText: oculto,
          autocorrect: !sinCorrector,
          decoration: InputDecoration(hintText: pista, prefixIcon: Icon(icono, size: 20)),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: MarcaEmpresa(tamano: 56)),
                  const SizedBox(height: 20),
                  Text(
                    'Portal de conductores',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600, color: context.texto),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Ingresa con el código de tu empresa y la placa de tu unidad',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: context.textoSuave),
                  ),
                  const SizedBox(height: 28),
                  Tarjeta(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _campo('Código de empresa', _empresaController, Icons.business_outlined,
                            pista: 'Ej. pulpos', sinCorrector: true),
                        const SizedBox(height: 16),
                        _campo('Placa del vehículo', _placaController, Icons.directions_car_outlined,
                            pista: 'Ej. 1234-ABC', sinCorrector: true),
                        const SizedBox(height: 16),
                        _campo('Contraseña', _passwordController, Icons.lock_outline, oculto: true),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _isLoading ? null : _iniciarSesion,
                          style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                          child: _isLoading
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                                )
                              : const Text('Iniciar sesión'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    '¿Olvidaste tu contraseña? Pídela a la central.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: context.textoSuave),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
