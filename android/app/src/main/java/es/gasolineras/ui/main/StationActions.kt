package es.gasolineras.ui.main

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import es.gasolineras.R

/** Hands the destination to any maps/navigation app (Google Maps, Waze, OsmAnd…). */
fun openDirections(context: Context, lat: Double, lon: Double, label: String) {
    val uri = Uri.parse("geo:$lat,$lon?q=$lat,$lon(${Uri.encode(label)})")
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, R.string.detail_no_maps_app, Toast.LENGTH_SHORT).show()
    }
}
