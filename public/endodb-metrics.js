/* Shared definitions: a procedure is a row; missing measurements are not false. */
(function (root) {
  const known = value => value === true || value === false;
  function bostonStatus(row) {
    if (row.procedure_type !== 'VCC') return 'na';
    const b = row.boston || {}, parts = [b.derecho, b.transverso, b.izquierdo];
    if (!Number.isInteger(b.total) || b.total < 0 || b.total > 9 || parts.some(v => !Number.isInteger(v) || v < 0 || v > 3)
        || parts.reduce((sum, v) => sum + v, 0) !== b.total) return 'incomplete';
    return b.total >= 6 && parts.every(v => v >= 2) ? 'adequate' : 'inadequate';
  }
  function fraction(rows, field) {
    const evaluable = rows.filter(row => known(row[field]));
    return { numerator: evaluable.filter(row => row[field] === true).length, denominator: evaluable.length, total: rows.length };
  }
  function summarize(rows) {
    const vcc = rows.filter(row => row.procedure_type === 'VCC');
    const boston = vcc.filter(row => ['adequate', 'inadequate'].includes(bostonStatus(row)));
    return {
      total: rows.length, veda: rows.filter(row => row.procedure_type === 'VEDA').length, vcc: vcc.length,
      cecal: fraction(vcc, 'entubacion_cecal'), polyps: fraction(vcc, 'polipos'), blocked: fraction(vcc, 'preparacion_impidio_progresion'),
      boston: { numerator: boston.filter(row => bostonStatus(row) === 'adequate').length, denominator: boston.length, total: vcc.length },
      gross: fraction(vcc.filter(row => row.incluir_tasa_bruta === true), 'entubacion_cecal'),
      adjusted: fraction(vcc.filter(row => row.incluir_tasa_ajustada === true), 'entubacion_cecal'),
      review: fraction(rows, 'requiere_revision'),
    };
  }
  const percent = metric => metric.denominator ? `${Math.round(metric.numerator * 1000 / metric.denominator) / 10}%` : 'Sin datos';
  const detail = metric => `${percent(metric)} · ${metric.numerator}/${metric.denominator} con dato`;
  function cards(rows) {
    const m = summarize(rows);
    const card = (title, metric) => [title, metric.denominator ? metric.numerator : 'Sin datos', `${detail(metric)} · ${metric.total - metric.denominator} sin dato`];
    return [
      ['Total de estudios', m.total, 'procedimientos'], ['Total VEDA', m.veda, 'procedimientos'], ['Total VCC', m.vcc, 'procedimientos'],
      card('VCC llegó a ciego', m.cecal), card('VCC Boston adecuado', m.boston), card('VCC con pólipos', m.polyps),
      card('VCC con preparación impeditiva', m.blocked),
      ['Tasa bruta cecal', percent(m.gross), `${m.gross.numerator}/${m.gross.denominator} incluidos con dato`],
      ['Tasa ajustada cecal', percent(m.adjusted), `${m.adjusted.numerator}/${m.adjusted.denominator} incluidos con dato`],
      card('Requieren revisión', m.review),
    ];
  }
  root.EndoDBMetrics = { bostonStatus, summarize, percent, detail, cards };
})(globalThis);
