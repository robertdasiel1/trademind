# Guía de Importación CSV - TradeMind

## Formatos Soportados

El sistema de importación CSV soporta automáticamente múltiples formatos de NinjaTrader y otros brokers.

### Formato 1: Estándar NinjaTrader (Recomendado)
```csv
Entry Price,Exit Price,Quantity,Symbol,Entry Time,Direction
1250.50,1255.75,1,ES,2024-01-15 10:30:00,Long
1250.25,1248.50,1,ES,2024-01-15 14:45:00,Short
```

### Formato 2: Simplificado
```csv
EntryPrice,ExitPrice,Qty,Asset
100.50,102.25,10,AAPL
101.00,99.75,10,AAPL
```

### Formato 3: Con Comisiones
```csv
Entry,Exit,Quantity,Asset,Date,Type
1050.50,1055.75,1,SPY,2024-01-15,Long
1050.25,1048.50,1,SPY,2024-01-16,Short
```

## Columnas Reconocidas Automáticamente

El sistema detecta automáticamente las siguientes variaciones de nombres:

### Precio de Entrada:
- `Entry Price`, `Entry`, `Entrada`, `Compra`, `EntryPrice`

### Precio de Salida:
- `Exit Price`, `Exit`, `Salida`, `Venta`, `ExitPrice`

### Cantidad:
- `Quantity`, `Qty`, `Cantidad`, `Size`

### Símbolo/Activo:
- `Symbol`, `Asset`, `Instrumento`, `Ticker`

### Hora:
- `Time`, `Date`, `Hora`, `Fecha`, `Entry Time`, `Timestamp`

### Dirección:
- `Direction`, `Side`, `Tipo`, `Long/Short`

## Requisitos Mínimos

- **Obligatorio**: Columnas de Entry Price y Exit Price
- **Recomendado**: Symbol, Date/Time, Direction
- **Opcional**: Quantity (por defecto 1), Commission, Notes

## Ejemplo de Importación

1. Abre **Ajustes > Datos > Importar/Exportar**
2. Selecciona **CSV**
3. Arrastra o selecciona tu archivo CSV
4. Revisa la vista previa (trades detectados, errores, advertencias)
5. Confirma la importación
6. La app se recargará con los nuevos trades

## Resolución de Errores

### Error: "No se encontraron columnas de Entry/Exit"
**Solución**: Asegúrate de que tu CSV tenga columnas con estos nombres o similares.

### Advertencia: "Fecha inválida"
**Solución**: Verifica que las fechas estén en formato ISO (YYYY-MM-DD) o RFC (Mon, DD Mon YYYY HH:MM:SS).

### Error: "Precios de entrada/salida inválidos"
**Solución**: Los precios deben ser números válidos (no vacíos ni letras).

## Ejemplo CSV Listo para Copiar

```csv
Symbol,Entry Price,Exit Price,Quantity,Entry Time,Direction
ES,4580.50,4585.75,1,2024-01-15 10:30:00,Long
ES,4580.25,4578.50,1,2024-01-15 14:45:00,Short
NQ,18500.00,18525.50,2,2024-01-16 09:00:00,Long
CL,80.50,82.25,10,2024-01-16 15:30:00,Short
```

## Notas Importantes

- Los precios se usan para calcular automáticamente las ganancias/pérdidas
- Las direcciones (Long/Short) se detectan automáticamente
- Los trades se marcan como "Cerrados" al importar
- Se asigna un ID único a cada trade importado
- Puedes importar múltiples veces sin perder datos anteriores (se añaden)
