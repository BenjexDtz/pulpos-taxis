// Importamos tu archivo de lógica
import 'package:pulpos_tarifa_core/calculadora.dart';

void main() {
  print('Iniciando batería de pruebas...');

  // Caso de Prueba 1: Condiciones extremas en El Alto
  double resultadoEscenarioCritico = calcularTarifa(
    distanciaKm: 5.0,
    costoBaseKm: 2.0,
    factorAltitud: 1.4,
    factorSuperficie: 2.5,
    tiempoDetencionMin: 10.0,
    costoMinutoDetencion: 0.5,
  );

  // La prueba real: Afirmamos que el resultado tiene que ser exactamente 40.0
  assert(
    resultadoEscenarioCritico == 40.0,
    'Fallo en cálculo: Se esperaba 40.0 pero se obtuvo $resultadoEscenarioCritico',
  );

  print('✅ Prueba 1 superada: El cálculo en escenario crítico es correcto.');

  // Caso de Prueba 2: Condiciones Ideales en El Alto (Asfalto sin tráfico)
  double resultadoEscenarioIdeal = calcularTarifa(
    distanciaKm: 5.0,
    costoBaseKm: 2.0,
    factorAltitud: 1.4,
    factorSuperficie: 1.0, // Asfalto
    tiempoDetencionMin: 0.0, // Sin trancadera
    costoMinutoDetencion: 0.5,
  );

  assert(
    resultadoEscenarioIdeal == 14.0,
    'Fallo en cálculo: Se esperaba 14.0 pero se obtuvo $resultadoEscenarioIdeal',
  );

  print('✅ Prueba 2 superada: El cálculo en escenario ideal es correcto.');
}
