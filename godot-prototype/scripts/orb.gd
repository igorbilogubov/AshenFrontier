extends Control

var ratio = 1.0
var tint = Color("a73930")

static func liquid_polygon(center: Vector2, radius: float, fill: float) -> PackedVector2Array:
	var polygon = PackedVector2Array()
	var clamped = clampf(fill, 0, 1)
	# Subpixel slivers are invisible and numerically degenerate when HP tends to 0.
	if radius <= 0 or 2 * radius * clamped < 0.05:
		return polygon
	if 2 * radius * (1 - clamped) < 0.05:
		for i in 96:
			var angle = i * TAU / 96
			polygon.append(center + Vector2(cos(angle), sin(angle)) * radius)
		return polygon
	# One convex arc closed by the horizontal waterline, with no repeated endpoint.
	var start = asin(1 - 2 * clamped)
	var span = PI - 2 * start
	var segments = maxi(2, int(ceil(span / TAU * 96)))
	for i in segments + 1:
		var angle = start + span * i / segments
		polygon.append(center + Vector2(cos(angle), sin(angle)) * radius)
	return polygon

func _draw():
	var center = size / 2
	var radius = minf(size.x, size.y) / 2 - 8
	draw_circle(center + Vector2(0, 3), radius + 7, Color(0, 0, 0, 0.4))
	draw_circle(center, radius + 5, Color("8f7950"))
	draw_circle(center, radius + 2, Color("292b26"))
	draw_circle(center, radius, Color("171e21"))
	var polygon = liquid_polygon(center, radius, ratio)
	if polygon.size() > 2:
		draw_colored_polygon(polygon, tint)
	draw_arc(center, radius - 4, PI * 1.08, PI * 1.72, 32, Color(1, 0.88, 0.65, 0.25), 2, true)
	draw_circle(center + Vector2(-radius * 0.30, -radius * 0.35), radius * 0.17, Color(1, 1, 1, 0.10))
