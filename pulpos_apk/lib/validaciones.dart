// Mismas reglas que validacion.js del servidor y src/validaciones.js del panel

String normalizarPlaca(String texto) => texto.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');

String? errorCodigoEmpresa(String texto) => RegExp(r'^[a-z0-9-]{3,30}$').hasMatch(texto.trim().toLowerCase())
    ? null
    : 'El código de empresa solo admite letras, números y guiones.';

String? errorPlaca(String texto) => RegExp(r'^\d{4}[A-Z]{3}$').hasMatch(normalizarPlaca(texto))
    ? null
    : 'La placa debe tener 4 números y 3 letras, por ejemplo 2456ZBK.';
