import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/calculadora.dart';
import 'package:pulpos_tarifa_core/viaje_en_curso.dart';
import 'package:shared_preferences/shared_preferences.dart';

const parametros = ParametrosTopograficos(
  id: 3,
  zonaCiudad: 'El Alto',
  costoBaseKm: 2,
  consumoLitrosKm: 0.1,
  precioCombustibleBs: 6.96,
  factorSuperficie: 1.5,
  factorEmpedrado: 1.2,
  costoMinutoDetencion: 0.5,
  bajadaBandera: 2,
  valorSalto: 0.5,
  modoTarifa: ModoTarifa.d,
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('sin viaje guardado devuelve null', () async {
    expect(await ViajeEnCurso.leer(), isNull);
  });

  test('guarda y recupera el viaje con los parámetros con los que empezó', () async {
    final inicio = DateTime(2026, 11, 17, 8, 30, 15);
    await ViajeEnCurso(uuid: 'u-1', choferId: 7, inicio: inicio, parametros: parametros).guardar();
    final leido = await ViajeEnCurso.leer();
    expect(leido!.uuid, 'u-1');
    expect(leido.choferId, 7);
    expect(leido.inicio, inicio);
    expect(leido.parametros.valorSalto, 0.5);
    expect(leido.parametros.bajadaBandera, 2);
    expect(leido.parametros.modoTarifa, ModoTarifa.d);
    expect(leido.parametros.factorEmpedrado, 1.2);
  });

  test('borrar lo quita', () async {
    await ViajeEnCurso(uuid: 'u-1', choferId: 7, inicio: DateTime(2026), parametros: parametros).guardar();
    await ViajeEnCurso.borrar();
    expect(await ViajeEnCurso.leer(), isNull);
  });

  test('un registro dañado o incompleto se ignora sin romper la app', () async {
    SharedPreferences.setMockInitialValues({'viaje_en_curso': '{no es json'});
    expect(await ViajeEnCurso.leer(), isNull);
    SharedPreferences.setMockInitialValues({'viaje_en_curso': '{"uuid":"u","chofer_id":"siete"}'});
    expect(await ViajeEnCurso.leer(), isNull);
  });
}
