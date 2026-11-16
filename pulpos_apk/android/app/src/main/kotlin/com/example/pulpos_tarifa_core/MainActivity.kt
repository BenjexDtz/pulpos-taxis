package com.example.pulpos_tarifa_core

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "pulpos/bateria").setMethodCallHandler { llamada, resultado ->
            when (llamada.method) {
                "estaExcluida" -> resultado.success(estaExcluida())
                "solicitarExclusion" -> resultado.success(solicitarExclusion())
                else -> resultado.notImplemented()
            }
        }
    }

    private fun estaExcluida(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val energia = getSystemService(Context.POWER_SERVICE) as PowerManager
        return energia.isIgnoringBatteryOptimizations(packageName)
    }

    @SuppressLint("BatteryLife")
    private fun solicitarExclusion(): Boolean {
        val directo = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
        return try {
            startActivity(directo)
            true
        } catch (e: Exception) {
            // Algunas capas (HiOS, MIUI) no tienen el diálogo directo: se abre la lista general
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                true
            } catch (e: Exception) {
                false
            }
        }
    }
}
