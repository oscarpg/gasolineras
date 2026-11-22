package es.gasolineras.state

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** A minimal immutable-state store: the only way state changes is through [update]. */
class Store<S>(initial: S) {
    private val mutable = MutableStateFlow(initial)
    val state: StateFlow<S> = mutable.asStateFlow()
    val value: S get() = mutable.value

    /** Atomically replaces the state with `fn(current)`. */
    fun update(fn: (S) -> S) = mutable.update(fn)
}
