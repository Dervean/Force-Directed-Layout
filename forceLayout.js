/**
 * forceLayout.js
 * @authors Joe Jiang (hijiangtao@gmail.com)
 * @date    2017-04-06 23:53:07
 * @version $Id$
 */

'use strict'
import * as d3 from 'd3';
import Vector from './Vector';
import Spring from './Spring';
import {Node, Edge} from './Elements';

/**
 * Point Struct
 * @param {[type]} position [description]
 * @param {Number} id       [description]
 * @param {Number} group    [description]
 * @param {Number} mass     [description]
 */
let Point = function(position, id = -1, group = -1, mass = 1.0) {
	this.p = position;
	this.m = mass;
	this.v = new Vector(0, 0); // velocity
	this.a = new Vector(0, 0); // acceleration
	this.id = id;
	this.group = group;

	let self = this;
	this.updateAcc = function(force) {
		self.a = self.a.add(force.divide(self.m));
	}
}

/**
 * Force Layout class
 */
class forceLayout {
	constructor(options) {
		this.props = {
			approach: 'canvas',
			detail: true,
			parentId: 'chart',
			containerId: 'forcedLayoutView',
			width: 800, // DOM width
			height: 600, // DOM height
			stiffness: 200.0, // spring stiffness
			repulsion: 200.0, // repulsion
			damping: 0.8, // volocity damping factor
			minEnergyThreshold: 0.1, // threshold to determine whether to stop
			maxSpeed: 1000, // max node speed
			defSpringLen: 20,
			coulombDisScale: 0.01,
			tickInterval: 0.02
		};

		this.nodes = [];
		this.edges = [];
		this.nodeSet = {};
		this.edgeSet = {};
		this.nodePoints = new Map();
		this.edgeSprings = new Map();

		this.initState = true;
		this.nextEdgeId = 0;
		this.iterations = 0;
		this.renderTime = 0;

		this.center = {};
		this.color = d3.scaleOrdinal(d3.schemeCategory20);

		this.canvas = {};
		this.ctx = {};

		/**
		 * Iterate options to update this.props
		 */
		if ('undefined' !== typeof options) {
			for (let i in options) {
				if ('undefined' !== typeof options[i]) {
					this.props[i] = options[i];
				}
			}
		}
	}

	addNode(node) {
		if (!(node.id in this.nodeSet)) {
			this.nodes.push(node);
		}

		this.nodeSet[node.id] = node;
		return node;
	};
	addNodes(data) {
		let len = data.length;
		for (let i = 0; i < len; i++) {
			let node = new Node(data[i]);
			this.addNode(node);
		}
	};

	addEdge(edge) {
		if (!(edge.id in this.edgeSet)) {
			this.edges.push(edge);
		}

		this.edgeSet[edge.id] = edge;
		return edge;
	};
	addEdges(data) {
		let len = data.length;
		for (let i = 0; i < len; i++) {
			let e = data[i],
				node1 = this.nodeSet[e['source']];
			if (node1 == undefined) {
				throw new TypeError("invalid node name: " + e[0]);
			}

			let node2 = this.nodeSet[e['target']];
			if (node2 == undefined) {
				throw new TypeError("invalid node name: " + e[1]);
			}

			let attr = e['value'],
				edge = new Edge(this.nextEdgeId++, node1, node2, attr);
			this.addEdge(edge);
		}
	};

	setData(data) {
		// clean all data
		this.nodes = [];
		this.edges = [];
		this.nodeSet = {};
		this.edgeSet = {};
		this.nodePoints = new Map();
		this.edgeSprings = new Map();

		// Format data to json object
		if (typeof data == 'string' || data instanceof String) {
			data = JSON.parse(data);
		}

		// add nodes and edges
		if ('nodes' in data || 'edges' in data) {
			this.addNodes(data['nodes']);
			this.addEdges(data['edges']);
			this.center = new Vector(this.props.width / 2, this.props.height / 2);
		}
	}

	start() {
		let self = this,
			nlen = this.nodes.length,
			elen = this.edges.length;

		let startX = this.props.width * 0.5,
			startY = this.props.height * 0.5,
			initSize = 20;

		for (let i = 0; i < nlen; i++) {
			// initial the point position
			let node = this.nodes[i],
				x = startX + initSize * (Math.random() - .5),
				y = startY + initSize * (Math.random() - .5),
				vec = new Vector(x, y);
			this.nodePoints.set(node.id, new Point(vec, node.id, node.data.group));
		}

		for (let i = 0; i < elen; i++) {
			let edge = this.edges[i],
				source = this.nodePoints.get(edge.source.id),
				target = this.nodePoints.get(edge.target.id),
				length = this.props.defSpringLen * Number.parseInt(edge.data);
			// length = source.p.subtract( target.p ).magnitude();

			this.edgeSprings.set(edge.id, new Spring(source, target, length));
		}

		let timer = setInterval(function() {
			self.renderTime += 10;
		}, 10);

		window.requestAnimationFrame(function step() {
			self.tick(self.props.tickInterval);
			self.render();
			self.iterations++;
			let energy = self.calTotalEnergy();

			if (self.props.detail) {
				self.updateDetails(energy);
			}

			if (energy < self.props.minEnergyThreshold || self.iterations === 1000000) {
				window.cancelAnimationFrame(step);
				clearInterval(timer);
			} else {
				window.requestAnimationFrame(step);
			}
		});
	}

	updateDetails(energy) {
		let ths = document.getElementById('detailTable').getElementsByTagName('td');
		if (this.iterations === 1) {
			/**
			 * Update Items in first time
			 *
			 * {Drawing Approach} [1]
			 * {Node Number} [9]
			 * {Edge Number} [11]
			 * {DOM ChildNodes} [15]
			 */
			ths[1].innerHTML = this.props.approach;
			ths[9].innerHTML = this.nodes.length;
			ths[11].innerHTML = this.edges.length;
			ths[15].innerHTML = this.props.approach === 'canvas' ? 1 : this.nodes.length + this.edges.length;
		}

		/**
		 * Regular update items
		 * 
		 * {Render time} [3]
		 * {Iterations} [5]
		 * {Current Energy} [7]
		 * {Used JS Heap Size} [13]
		 */
		ths[3].innerHTML = `${this.renderTime}ms`;
		ths[5].innerHTML = this.iterations;
		ths[7].innerHTML = energy.toFixed(2);
		ths[13].innerHTML = `${window.performance.memory.usedJSHeapSize}`;
	}

	/**
	 * tick event
	 * @param  {[type]} interval [description]
	 * @return {[type]}          [description]
	 */
	tick(interval) {
		this.updateCoulombsLaw();
		this.updateHookesLaw();
		this.attractToCentre();
		this.updateVelocity(interval);
		this.updatePosition(interval);
	}

	/**
	 * Update repulsion between nodes
	 * @return {[type]} [description]
	 */
	updateCoulombsLaw() {
		let len = this.nodes.length;

		for (let i = 0; i < len; i++) {
			for (let j = i + 1; j < len; j++) {
				if (i === j) continue;

				let iNode = this.nodes[i],
					jNode = this.nodes[j],
					v = this.nodePoints.get(iNode.id).p.subtract(this.nodePoints.get(jNode.id).p),
					dis = (v.magnitude() + 0.1) * this.props.coulombDisScale,
					direction = v.normalise();

				// console.log('dis', dis);
				this.nodePoints.get(iNode.id).updateAcc(direction.multiply(this.props.repulsion).divide(Math.pow(dis, 2)));
				this.nodePoints.get(jNode.id).updateAcc(direction.multiply(this.props.repulsion).divide(-Math.pow(dis, 2)));
			}
		}
	}

	/**
	 * update attraction between edges
	 * @return {[type]} [description]
	 */
	updateHookesLaw() {
		let len = this.edges.length;

		for (let i = 0; i < len; i++) {
			let spring = this.edgeSprings.get(this.edges[i].id),
				v = spring.target.p.subtract(spring.source.p),
				displacement = spring.length - v.magnitude(),
				direction = v.normalise();

			// console.log(spring.source, spring.target);
			spring.source.updateAcc(direction.multiply(-this.props.stiffness * displacement));
			spring.target.updateAcc(direction.multiply(this.props.stiffness * displacement));
		}
	}

	/**
	 * Attract to center with little repulsion acceleration
	 * @return {[type]} [description]
	 */
	attractToCentre() {
		let len = this.nodes.length;

		for (let i = 0; i < len; i++) {
			let point = this.nodePoints.get(this.nodes[i].id),
				direction = point.p.subtract(this.center);

			point.updateAcc(direction.multiply(-this.props.repulsion / 100.0));
		}
	}

	/**
	 * update points' velocity
	 * @param  {[type]} interval [description]
	 * @return {[type]}          [description]
	 */
	updateVelocity(interval) {
		let len = this.nodes.length;

		for (let i = 0; i < len; i++) {
			let point = this.nodePoints.get(this.nodes[i].id);
			point.v = point.v.add(point.a.multiply(interval)).multiply(this.props.damping);

			if (point.v.magnitude() > this.props.maxSpeed) {
				point.v = point.v.normalise().multiply(this.props.maxSpeed);
			}
			point.a = new Vector(0, 0);
		}
	}

	/**
	 * calculate point's position
	 * @param  {[type]} interval [description]
	 * @return {[type]}          [description]
	 */
	updatePosition(interval) {
		let len = this.nodes.length;

		for (let i = 0; i < len; i++) {
			let point = this.nodePoints.get(this.nodes[i].id);
			point.p = point.p.add(point.v.multiply(interval));
		}
	}

	/**
	 * calculate total energy
	 * @return {[type]} [description]
	 */
	calTotalEnergy() {
		let energy = 0.0,
			len = this.nodes.length;

		for (let i = 0; i < len; i++) {
			let point = this.nodePoints.get(this.nodes[i].id),
				speed = point.v.magnitude();

			energy += point.m * Math.pow(speed, 2) * 0.5;
		}

		return energy;
	}

	/**
	 * get current points' boundary
	 * @return {[type]} [description]
	 */
	getBounds() {
		let bottomleft = new Vector(-2, -2),
			topright = new Vector(2, 2);

		this.nodePoints.forEach(function(point, key, map) {
			if (point.p.x < bottomleft.x) {
				bottomleft.x = point.p.x;
			}
			if (point.p.y < bottomleft.y) {
				bottomleft.y = point.p.y;
			}
			if (point.p.x > topright.x) {
				topright.x = point.p.x;
			}
			if (point.p.y > topright.y) {
				topright.y = point.p.y;
			}
		});

		let padding = topright.subtract(bottomleft).multiply(0.05);
		return {
			'bottomleft': bottomleft.subtract(padding),
			'topright': topright.add(padding)
		}
	}

	/**
	 * render function
	 * @return {[type]} [description]
	 */
	render() {
		let self = this,
			nlen = this.nodes.length,
			elen = this.edges.length,
			approach = this.props.approach;

		/**
		 * Initiate Container size again
		 * @param  {[type]} this.initState [description]
		 * @return {[type]}                [description]
		 */
		if (this.initState) {
			this.initState = !this.initState;
			initContainerSize();
		}

		/**
		 * Clean canvas layout
		 */
		if (this.props.approach === 'canvas') {
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		}


		this.edgeSprings.forEach(function(val, key, map) {
			drawEdge(key, val);
		});

		this.nodePoints.forEach(function(val, key, map) {
			// Map(key, val)
			drawNode(key, val);
		});

		function initContainerSize() {
			let e = document.getElementById(self.props.containerId);
			if (e) {
				e.parentNode.removeChild(e);
			}

			if (self.props.approach === 'canvas') {
				let container = document.createElement('canvas');
				container.id = self.props.containerId;
				container.width = self.props.width;
				container.height = self.props.height;
				document.getElementById(self.props.parentId).appendChild(container);

				self.canvas = container;
				self.ctx = container.getContext("2d");
				return;
			}

			let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute('id', self.props.containerId);
			document.getElementById(self.props.parentId).appendChild(svg);

			// svg.innerHTML = '';
			svg.setAttribute('width', self.props.width);
			svg.setAttribute('height', self.props.height);
		}

		function drawNode(key, val) {
			let fillStyle = self.color(val.group),
				strokeStyle = 'rgb(255,255,255)',
				r = 5,
				lineWidth = 1;

			if (self.props.approach === 'canvas') {
				self.ctx.strokeStyle = strokeStyle;
				self.ctx.fillStyle = fillStyle;
				self.ctx.lineWidth = lineWidth;
				self.ctx.beginPath();
				self.ctx.arc(val.p.x, val.p.y, r, 0, 2 * Math.PI);
				self.ctx.stroke();
				self.ctx.fill();

				return;
			}

			let node = d3.select(`#node-${key}`),
				container = d3.select(`#${self.props.containerId}`);

			if (node.empty()) {
				node = container.append('circle')
					.attr('id', `node-${key}`)
					.attr('r', r)
					.attr('fill', fillStyle)
					.attr('stroke', strokeStyle)
					.attr('stroke-width', lineWidth);
			}

			node.attr('cx', val.p.x)
				.attr('cy', val.p.y);
		}

		function drawEdge(key, val) {
			let source = val.source,
				target = val.target,
				strokeStyle = 'rgb(100,100,100)',
				strokeWidth = Math.sqrt(val.length) * 0.1;

			if (self.props.approach === 'canvas') {
				self.ctx.strokeStyle = strokeStyle;
				self.ctx.lineWidth = strokeWidth;
				self.ctx.beginPath();
				self.ctx.moveTo(source.p.x, source.p.y);
				self.ctx.lineTo(target.p.x, target.p.y);
				self.ctx.stroke();

				return;
			}

			let edge = d3.select(`#edge-${key}`),
				sNode = d3.select(`#node-${source.id}`),
				tNode = d3.select(`#node-${target.id}`),
				container = d3.select(`#${self.props.containerId}`);

			if (edge.empty()) {
				edge = container.append('line')
					.attr('id', `edge-${key}`)
					.style('stroke', strokeStyle)
					.style('stroke-width', strokeWidth);
			}
			// if (sNode.empty()) {
			// 	sNode = container.append('circle')
			// 		.attr('id', `node-${source.id}`)
			// 		.attr('r', 2)
			// 		.attr('fill', 'black')
			// 		.attr('stroke', 'none');
			// }
			// if (tNode.empty()) {
			// 	tNode = container.append('circle')
			// 		.attr('id', `node-${target.id}`)
			// 		.attr('r', 2)
			// 		.attr('fill', 'black')
			// 		.attr('stroke', 'none');
			// }

			// update nodes and edge position
			edge.attr('x1', source.p.x)
				.attr('y1', source.p.y)
				.attr('x2', target.p.x)
				.attr('y2', target.p.y);

			// sNode.attr('cx', source.p.x)
			// 	.attr('cy', source.p.y);
			// tNode.attr('cx', target.p.x)
			// 	.attr('cy', target.p.y);
		}

	}
}

export default forceLayout;
