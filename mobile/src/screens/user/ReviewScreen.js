import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StarRating from '../../components/StarRating';
import { reviewsAPI } from '../../api/client';

export default function ReviewScreen({ route, navigation }) {
  const { orderId, providerId, providerName, requestNumber } = route.params;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ratingLabels = ['', 'Terrible', 'Poor', 'Average', 'Good', 'Excellent'];

  async function handleSubmit() {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please tap a star to rate.');
      return;
    }

    setSubmitting(true);
    try {
      await reviewsAPI.submit({
        orderId,
        providerId,
        rating,
        comment: comment.trim() || null,
      });
      Alert.alert('Thank You!', 'Your review has been submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to submit review.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="star" size={32} color="#f59e0b" />
          </View>
          <Text style={styles.headerTitle}>Rate Your Experience</Text>
          <Text style={styles.headerSub}>Order #{requestNumber}</Text>
          {providerName && <Text style={styles.headerProvider}>{providerName}</Text>}
        </View>

        {/* Stars */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Tap to rate</Text>
          <View style={styles.starsContainer}>
            <StarRating rating={rating} onRate={setRating} size={42} />
          </View>
          {rating > 0 && (
            <Text style={[styles.ratingLabel, { color: rating >= 4 ? '#10b981' : rating >= 3 ? '#f59e0b' : '#ef4444' }]}>
              {ratingLabels[rating]}
            </Text>
          )}
        </View>

        {/* Comment */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Comment (optional)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Tell us about your experience..."
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Submit Review</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { padding: 20, paddingTop: 10 },

  header: { alignItems: 'center', marginBottom: 24 },
  headerIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  headerSub: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  headerProvider: { fontSize: 16, fontWeight: '600', color: '#3b82f6', marginTop: 4 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },

  starsContainer: { alignItems: 'center', paddingVertical: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 18, fontWeight: '700', marginTop: 8 },

  commentInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top', color: '#1f2937' },
  charCount: { textAlign: 'right', fontSize: 11, color: '#9ca3af', marginTop: 4 },

  submitBtn: { flexDirection: 'row', backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  submitBtnDisabled: { backgroundColor: '#d1d5db' },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  skipBtn: { alignItems: 'center', paddingVertical: 16 },
  skipBtnText: { color: '#6b7280', fontSize: 14 },
});
