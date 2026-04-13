function dibujarOlas(containerId, alturaFija) {
    const contenedor = document.getElementById(containerId);
    if (!contenedor) return;

    const ancho = contenedor.clientWidth;
    const alto = alturaFija || contenedor.clientHeight;
    const margen = { top: 20, right: 20, bottom: 40, left: 40 };
    const w = ancho - margen.left - margen.right;
    const h = alto - margen.top - margen.bottom;

    const svg = d3.select(`#${containerId}`)
        .append('svg')
        .attr('width', ancho)
        .attr('height', alto);

    const g = svg.append('g')
        .attr('transform', `translate(${margen.left},${margen.top})`);

    const x = d3.scalePoint().domain(horas).range([0, w]);
    const y = d3.scaleLinear()
        .domain([0, d3.max(alturas) * 1.2])
        .range([h, 0]);

    const gradId = `gradiente-${containerId}`;
    const defs = svg.append('defs');
    const gradiente = defs.append('linearGradient')
        .attr('id', gradId)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', 0).attr('y2', h);

    gradiente.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#FFD800')
        .attr('stop-opacity', 0.4);
    gradiente.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#FFD800')
        .attr('stop-opacity', 0);

    const area = d3.area()
        .x((d, i) => x(horas[i]))
        .y0(h).y1(d => y(d))
        .curve(d3.curveCatmullRom);

    const linea = d3.line()
        .x((d, i) => x(horas[i]))
        .y(d => y(d))
        .curve(d3.curveCatmullRom);

    g.append('path')
        .datum(alturas)
        .attr('fill', `url(#${gradId})`)
        .attr('d', area);

    const path = g.append('path')
        .datum(alturas)
        .attr('fill', 'none')
        .attr('stroke', '#FFD800')
        .attr('stroke-width', 2)
        .attr('d', linea);

    const longitud = path.node().getTotalLength();
    path
        .attr('stroke-dasharray', longitud)
        .attr('stroke-dashoffset', longitud)
        .transition().duration(1500)
        .ease(d3.easeQuadInOut)
        .attr('stroke-dashoffset', 0);

    g.append('g')
        .attr('transform', `translate(0,${h})`)
        .call(d3.axisBottom(x)
            .tickValues(horas.filter((d, i) => i % 4 === 0)))
        .selectAll('text')
        .attr('fill', 'rgba(255,255,255,0.5)')
        .attr('font-size', '11px');

    g.append('g')
        .call(d3.axisLeft(y).ticks(5))
        .selectAll('text')
        .attr('fill', 'rgba(255,255,255,0.5)')
        .attr('font-size', '11px');

    g.append('g').attr('class', 'grid')
        .call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''))
        .selectAll('line')
        .attr('stroke', 'rgba(255,255,255,0.05)');

    g.selectAll('.domain').attr('stroke', 'rgba(255,255,255,0.1)');

    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip-d3')
        .style('opacity', 0);

    g.selectAll('.punto')
        .data(alturas).enter()
        .append('circle')
        .attr('cx', (d, i) => x(horas[i]))
        .attr('cy', d => y(d))
        .attr('r', 4)
        .attr('fill', '#FFD800')
        .attr('opacity', 0)
        .on('mouseover', function(event, d) {
            const i = alturas.indexOf(d);
            d3.select(this).attr('opacity', 1).attr('r', 6);
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(`${horas[i]}<br><strong>${d}m</strong>`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 30) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).attr('opacity', 0).attr('r', 4);
            tooltip.transition().duration(200).style('opacity', 0);
        });
}

function dibujarBrujula(grados, direccion) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;

    const svg = d3.select('#brujula-container')
        .append('svg')
        .attr('width', size)
        .attr('height', size);

    svg.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 1);

    const cardinales = ['N', 'E', 'S', 'O'];
    cardinales.forEach((c, i) => {
        const angulo = (i * 90 - 90) * Math.PI / 180;
        const x = cx + (r - 8) * Math.cos(angulo);
        const y = cy + (r - 8) * Math.sin(angulo);
        svg.append('text')
            .attr('x', x).attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', c === 'N' ? '#FFD800' : 'rgba(255,255,255,0.4)')
            .attr('font-size', '8px')
            .text(c);
    });

    const aguja = svg.append('g')
        .attr('transform', `translate(${cx},${cy})`);

    aguja.append('polygon')
        .attr('points', '0,-28 5,0 -5,0')
        .attr('fill', '#FFD800');

    aguja.append('polygon')
        .attr('points', '0,28 5,0 -5,0')
        .attr('fill', 'rgba(255,255,255,0.2)');

    aguja.append('circle')
        .attr('r', 3)
        .attr('fill', 'white');

    svg.append('text')
        .attr('x', cx).attr('y', cy + r - 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .attr('font-size', '9px')
        .text(direccion);

    aguja.transition()
        .duration(1000)
        .ease(d3.easeElasticOut)
        .attrTween('transform', () => {
            const interpolate = d3.interpolate(0, grados);
            return t => `translate(${cx},${cy}) rotate(${interpolate(t)})`;
        });
}

function dibujarBeaufort(valor) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;
    const r = 28;

    const colores = [
        '#FFD800','#FFD800','#FFD800','#FFD800',
        '#90EE90','#90EE90',
        '#FFD700','#FFD700',
        '#FFA500','#FFA500',
        '#FF4444','#FF4444','#FF0000'
    ];
    const color = colores[valor] || '#FFD800';

    const svg = d3.select('#beaufort-container')
        .append('svg')
        .attr('width', size)
        .attr('height', size);

    const arcFondo = d3.arc()
        .innerRadius(r - 6).outerRadius(r)
        .startAngle(-Math.PI * 0.75).endAngle(Math.PI * 0.75);

    svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('d', arcFondo())
        .attr('fill', 'rgba(255,255,255,0.1)');

    const anguloPorUnidad = (Math.PI * 1.5) / 12;
    const anguloFinal = -Math.PI * 0.75 + anguloPorUnidad * valor;
    const arcValor = d3.arc()
        .innerRadius(r - 6).outerRadius(r)
        .startAngle(-Math.PI * 0.75);

    const path = svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('fill', color);

    path.transition().duration(1000).ease(d3.easeQuadInOut)
        .attrTween('d', () => {
            const interpolate = d3.interpolate(-Math.PI * 0.75, anguloFinal);
            return t => arcValor.endAngle(interpolate(t))();
        });

    svg.append('text')
        .attr('x', cx).attr('y', cy + 5)
        .attr('text-anchor', 'middle')
        .attr('fill', color)
        .attr('font-size', '20px')
        .attr('font-weight', '500')
        .text(valor);

    svg.append('text')
        .attr('x', cx - r + 2).attr('y', cy + r - 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.3)')
        .attr('font-size', '7px')
        .text('0');

    svg.append('text')
        .attr('x', cx + r - 2).attr('y', cy + r - 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.3)')
        .attr('font-size', '7px')
        .text('12');
}

function dibujarSol(sunrise, sunset) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2 + 10;
    const r = 24;

    const ahora = new Date();
    const horaActual = ahora.getHours() * 60 + ahora.getMinutes();
    const [hSR, mSR] = sunrise.split(':').map(Number);
    const [hSS, mSS] = sunset.split(':').map(Number);
    const minSalida = hSR * 60 + mSR;
    const minPuesta = hSS * 60 + mSS;
    const progreso = Math.min(1, Math.max(0,
        (horaActual - minSalida) / (minPuesta - minSalida)
    ));
    const anguloSol = -Math.PI / 2 + progreso * Math.PI;

    const svg = d3.select('#sol-container')
        .append('svg')
        .attr('width', size)
        .attr('height', size);

    const arcFondo = d3.arc()
        .innerRadius(r - 4).outerRadius(r)
        .startAngle(-Math.PI / 2).endAngle(Math.PI / 2);

    svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('d', arcFondo())
        .attr('fill', 'rgba(255,255,255,0.1)');

    const arcDia = d3.arc()
        .innerRadius(r - 4).outerRadius(r)
        .startAngle(-Math.PI / 2);

    const pathDia = svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('fill', '#FFD700');

    pathDia.transition().duration(1200).ease(d3.easeQuadInOut)
        .attrTween('d', () => {
            const interp = d3.interpolate(-Math.PI / 2, anguloSol);
            return t => arcDia.endAngle(interp(t))();
        });

    const anguloReal = anguloSol - Math.PI / 2;
    const solXreal = cx + r * Math.cos(anguloReal);
    const solYreal = cy + r * Math.sin(anguloReal);

    svg.append('circle')
        .attr('cx', cx - r).attr('cy', cy)
        .attr('r', 5).attr('fill', '#FFD700').attr('opacity', 0)
        .transition().delay(400).duration(800).ease(d3.easeQuadInOut)
        .attr('opacity', 1)
        .attr('cx', solXreal)
        .attr('cy', solYreal);

    svg.append('line')
        .attr('x1', cx - r).attr('y1', cy)
        .attr('x2', cx + r).attr('y2', cy)
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 1);

    svg.append('text')
        .attr('x', cx - r + 2).attr('y', cy + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .attr('font-size', '8px')
        .text(sunrise);

    svg.append('text')
        .attr('x', cx + r - 2).attr('y', cy + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .attr('font-size', '8px')
        .text(sunset);
}

function dibujarOlaIndicador(max, min, media) {
    const size = 80;
    const svg = d3.select('#olas-container')
        .append('svg')
        .attr('width', size)
        .attr('height', size);

    const barW = 12;
    const barH = 50;
    const barX = size / 2 - barW / 2;
    const barY = size / 2 - barH / 2;
    const maxPosible = 5;

    svg.append('rect')
        .attr('x', barX).attr('y', barY)
        .attr('width', barW).attr('height', barH)
        .attr('rx', 6)
        .attr('fill', 'rgba(255,255,255,0.1)');

    const alturaMax = (max / maxPosible) * barH;
    svg.append('rect')
        .attr('x', barX).attr('y', barY + barH)
        .attr('width', barW).attr('height', 0)
        .attr('rx', 6).attr('fill', '#FFD800')
        .transition().duration(1000).ease(d3.easeQuadInOut)
        .attr('y', barY + barH - alturaMax)
        .attr('height', alturaMax);

    const yMedia = barY + barH - (media / maxPosible) * barH;
    svg.append('line')
        .attr('x1', barX - 4).attr('y1', yMedia)
        .attr('x2', barX + barW + 4).attr('y2', yMedia)
        .attr('stroke', 'rgba(255,255,255,0.5)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2');

    svg.append('text')
        .attr('x', barX + barW + 8).attr('y', barY + barH - alturaMax + 4)
        .attr('fill', '#FFD800')
        .attr('font-size', '11px').attr('font-weight', '500')
        .text(`${max}m`);

    svg.append('text')
        .attr('x', barX + barW + 8).attr('y', barY + barH)
        .attr('fill', 'rgba(255,255,255,0.4)')
        .attr('font-size', '9px')
        .text(`${min}m`);
}

function dibujarPresion(valor) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;
    const r = 28;

    // rango típico de presión: 970 - 1050 hPa
    const min = 970;
    const max = 1050;
    const progreso = (valor - min) / (max - min);
    const anguloFinal = -Math.PI * 0.75 + progreso * Math.PI * 1.5;

    const color = valor < 1000 ? '#FFA500' : valor < 1013 ? '#FFD700' : '#FFD800';

    const svg = d3.select('#presion-container')
        .append('svg')
        .attr('width', size).attr('height', size);

    const arcFondo = d3.arc()
        .innerRadius(r - 6).outerRadius(r)
        .startAngle(-Math.PI * 0.75).endAngle(Math.PI * 0.75);

    svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('d', arcFondo())
        .attr('fill', 'rgba(255,255,255,0.1)');

    const arcValor = d3.arc()
        .innerRadius(r - 6).outerRadius(r)
        .startAngle(-Math.PI * 0.75);

    const path = svg.append('path')
        .attr('transform', `translate(${cx},${cy})`)
        .attr('fill', color);

    path.transition().duration(1000).ease(d3.easeQuadInOut)
        .attrTween('d', () => {
            const interp = d3.interpolate(-Math.PI * 0.75, anguloFinal);
            return t => arcValor.endAngle(interp(t))();
        });

    svg.append('text')
        .attr('x', cx).attr('y', cy + 4)
        .attr('text-anchor', 'middle')
        .attr('fill', color)
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text(`${valor}`);

    svg.append('text')
        .attr('x', cx).attr('y', cy + 15)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.3)')
        .attr('font-size', '7px')
        .text('hPa');
}

function dibujarVisibilidad(km) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;

    const svg = d3.select('#visibilidad-container')
        .append('svg')
        .attr('width', size).attr('height', size);

    // círculos concéntricos de distancia
    const radios = [8, 16, 24, 32];
    radios.forEach((r, i) => {
        svg.append('circle')
            .attr('cx', cx).attr('cy', cy).attr('r', r)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(255,255,255,0.08)')
            .attr('stroke-width', 1);
    });

    // color según visibilidad
    const color = km < 5 ? '#FF4444' : km < 10 ? '#FFA500' : '#FFD800';

    // radio proporcional — máximo 50km
    const radioVis = Math.min(32, (km / 50) * 32);

    svg.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 0)
        .attr('fill', color)
        .attr('opacity', 0.15)
        .transition().duration(1000).ease(d3.easeQuadInOut)
        .attr('r', radioVis);

    svg.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 0)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .transition().duration(1000).ease(d3.easeQuadInOut)
        .attr('r', radioVis);

    // punto central
    svg.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 3)
        .attr('fill', color);

    // valor
    svg.append('text')
        .attr('x', cx).attr('y', cy + 3)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '9px')
        .attr('font-weight', '500')
        .text(`${km}km`);
}

function dibujarTempAgua(valor) {
    const size = 80;
    const cx = size / 2;
    const cy = size / 2;
    const r = 10;
    const barH = 44;
    const barX = cx - 5;
    const barY = cy - barH / 2;

    // rango: 10°C - 30°C
    const progreso = Math.min(1, Math.max(0, (valor - 10) / 20));
    const color = valor < 18 ? '#FFD800' : valor < 24 ? '#90EE90' : '#FFA500';

    const svg = d3.select('#temp-agua-container')
        .append('svg')
        .attr('width', size).attr('height', size);

    // termómetro — tubo fondo
    svg.append('rect')
        .attr('x', barX).attr('y', barY)
        .attr('width', 10).attr('height', barH)
        .attr('rx', 5)
        .attr('fill', 'rgba(255,255,255,0.1)');

    // termómetro — relleno animado
    const alturaRelleno = progreso * barH;
    svg.append('rect')
        .attr('x', barX)
        .attr('y', barY + barH)
        .attr('width', 10).attr('height', 0)
        .attr('rx', 5)
        .attr('fill', color)
        .transition().duration(1000).ease(d3.easeQuadInOut)
        .attr('y', barY + barH - alturaRelleno)
        .attr('height', alturaRelleno);

    // bola del termómetro
    svg.append('circle')
        .attr('cx', barX + 5).attr('cy', barY + barH + 7)
        .attr('r', 7)
        .attr('fill', color);

    // valor
    svg.append('text')
        .attr('x', barX + 22).attr('y', barY + barH - alturaRelleno + 4)
        .attr('fill', color)
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .text(`${valor}°`);
}

if (document.getElementById('presion-container')) dibujarPresion(presionValor);
if (document.getElementById('visibilidad-container')) dibujarVisibilidad(visibilidadValor);
if (document.getElementById('temp-agua-container') && tempAguaValor) dibujarTempAgua(tempAguaValor);

// inicializar todos los widgets
dibujarOlas('grafico-olas', 160);
dibujarOlas('grafico-olas-derecho');
dibujarBrujula(vientoGrados, vientoDir);
dibujarBeaufort(beaufortValor);
dibujarSol(sunrise, sunset);
dibujarOlaIndicador(olaMax, olaMin, olaMedia);