import 'package:flutter_test/flutter_test.dart';
import 'package:pulpos_tarifa_core/validaciones.dart';

void main() {
  test('la placa son 4 números y 3 letras, con o sin guion', () {
    for (final bien in ['2456ZBK', '2456-ZBK', '2456-zbk', ' 2456 zbk ']) {
      expect(errorPlaca(bien), isNull, reason: bien);
    }
    expect(normalizarPlaca(' 2456-zbk '), '2456ZBK');
    for (final mal in ['245ZBK', '24567ZBK', '2456ZB', 'ZBK2456', '2456Z1K', '']) {
      expect(errorPlaca(mal), isNotNull, reason: mal);
    }
  });

  test('el código de empresa no admite espacios ni símbolos', () {
    expect(errorCodigoEmpresa(' Pulpos '), isNull);
    expect(errorCodigoEmpresa('taxis-sur'), isNull);
    for (final mal in ['ab', 'radio taxis', 'pulpos!', '']) {
      expect(errorCodigoEmpresa(mal), isNotNull, reason: mal);
    }
  });
}
