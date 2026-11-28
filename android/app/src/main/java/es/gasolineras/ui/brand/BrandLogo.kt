package es.gasolineras.ui.brand

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The brand's logo on a white circle (so it reads in dark theme too), or nothing when the
 * brand has no logo. Decorative: the brand name is always shown next to it.
 */
@Composable
fun BrandLogo(brand: String, size: Dp, modifier: Modifier = Modifier) {
    val logo = BrandBadges.logo(brand) ?: return
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(Color.White)
            .border(1.dp, Color.Black.copy(alpha = 0.12f), CircleShape)
            .padding(size * 0.13f),
        contentAlignment = Alignment.Center,
    ) {
        Image(painterResource(logo), contentDescription = null)
    }
}
