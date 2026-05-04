import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'main.dart'; // Para poder saltar a tu taxímetro

class PantallaLogin extends StatefulWidget {
  const PantallaLogin({super.key});

  @override
  State<PantallaLogin> createState() => _PantallaLoginState();
}

class _PantallaLoginState extends State<PantallaLogin> {
  final TextEditingController _placaController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;

  Future<void> _iniciarSesion() async {
    // Evitar que el usuario mande campos vacíos
    if (_placaController.text.isEmpty || _passwordController.text.isEmpty) {
      _mostrarError('Por favor, llena todos los campos.');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    // ⚠️ La IP exacta de tu computadora donde corre Node.js
    const String url = 'http://192.168.0.102:3000/api/login';

    try {
      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
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

        // 2. Guardamos todo en el disco duro del celular (SharedPreferences)
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('jwt_token', token);
        await prefs.setInt('chofer_id', choferId);
        await prefs.setString('nombre_chofer', nombreChofer);

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
      _mostrarError('Error de red. ¿Estás en el mismo WiFi que el servidor?');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _mostrarError(String mensaje) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(mensaje), backgroundColor: Colors.red[800]),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black, // Estilo oscuro profesional
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(30.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Logo o Título de la Central
                const Icon(
                  Icons.local_taxi,
                  size: 80,
                  color: Colors.blueAccent,
                ),
                const SizedBox(height: 20),
                const Text(
                  'RADIO TAXIS\nPULPOS',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Portal de Conductores',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Colors.grey[400]),
                ),
                const SizedBox(height: 50),

                // Campo: Placa del Vehículo
                TextField(
                  controller: _placaController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Placa del Vehículo (Ej. 9999-TESIS)',
                    labelStyle: TextStyle(color: Colors.grey[400]),
                    prefixIcon: const Icon(
                      Icons.directions_car,
                      color: Colors.blueAccent,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.grey[800]!),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: const BorderSide(color: Colors.blueAccent),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    filled: true,
                    fillColor: Colors.grey[900],
                  ),
                ),
                const SizedBox(height: 20),

                // Campo: Contraseña
                TextField(
                  controller: _passwordController,
                  obscureText: true, // Oculta los caracteres
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Contraseña de Acceso',
                    labelStyle: TextStyle(color: Colors.grey[400]),
                    prefixIcon: const Icon(
                      Icons.lock,
                      color: Colors.blueAccent,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Colors.grey[800]!),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: const BorderSide(color: Colors.blueAccent),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    filled: true,
                    fillColor: Colors.grey[900],
                  ),
                ),
                const SizedBox(height: 40),

                // Botón de Iniciar Sesión
                ElevatedButton(
                  onPressed: _isLoading ? null : _iniciarSesion,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue[800],
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(15),
                    ),
                  ),
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text(
                          'INICIAR SESIÓN',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            letterSpacing: 1,
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
