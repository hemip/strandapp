package com.teraim.strand.utils;

public abstract class ArrayHelper {

    public static <T> T GetValueOrDefault(T[] array, int position, T defaultValue) {
        if (array == null || array.length <= position)
            return defaultValue;

        return array[position];
    }

}
